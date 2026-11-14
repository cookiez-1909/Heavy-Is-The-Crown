// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Min {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title HITCPool, spike
/// @notice One EVM copy of a ticker in a cross-chain Heavy Is The Crown match: an ERC-20 on its own
/// constant-product curve against a stablecoin, like the NEAR copy, so both sides score in the same
/// unit and no price oracle is needed. Buying mints, selling burns. Net inflow scores
/// `amount × seconds left in the round`. The sell tax ramps from 0 to `penaltyBps` and stays in the curve.
///
/// The keyless NEAR arena decides the match and speaks here only through EIP-712 signatures from
/// `arena`, the EVM address NEAR Chain Signatures derives for it:
///  * `Release(to, nonce)`  this copy lost: its whole reserve leaves (towards the winner).
///  * `Won(nonce)`          this copy won: trading reopens and the loser's swapped reserve can be absorbed.
///  * `Grant(to, num, den, nonce)`  a holder of the losing NEAR copy receives num/den of the absorbed tokens.
contract HITCPool {
    // ------------------------------------------------------------------ ERC-20
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ------------------------------------------------------------------ match
    address public immutable arena;
    IERC20Min public immutable stable;
    uint64 public immutable roundStart;
    uint64 public immutable roundEnd;
    uint256 public immutable virtualStable;
    uint16 public immutable penaltyBps;
    uint256 public constant CURVE_SUPPLY = 1_000_000_000 ether;

    uint256 public curveTokens = CURVE_SUPPLY;
    uint256 public reserve;
    int256 public score;
    bool public released;
    bool public won;
    /// Tokens bought for the losing copy's holders, held here until granted.
    uint256 public absorbedTokens;
    uint256 public absorbedStable;
    /// Fixed at the first grant; grants are shares of it.
    uint256 public grantBase;
    mapping(uint256 => bool) public usedGrant;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant RELEASE_TYPEHASH = keccak256("Release(address to,uint256 nonce)");
    bytes32 private constant WON_TYPEHASH = keccak256("Won(uint256 nonce)");
    bytes32 private constant GRANT_TYPEHASH = keccak256("Grant(address to,uint256 num,uint256 den,uint256 nonce)");
    uint256 private constant HALF_ORDER = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    event Bought(address indexed buyer, uint256 stableIn, uint256 tokensOut, int256 scoreAdded);
    event Sold(address indexed seller, uint256 tokensIn, uint256 stableOut, uint256 tax, int256 scoreAdded);
    event Released(address indexed to, uint256 amount);
    event Won();
    event Absorbed(address indexed from, uint256 stableIn, uint256 spoils, uint256 tokensBought);
    event Granted(address indexed to, uint256 tokens, uint256 nonce);

    error RoundOver();
    error RoundNotOver();
    error NothingIn();
    error TooLittleOut();
    error AlreadyDone();
    error NotSignedByArena();
    error BadSignature();
    error Frozen();
    error Insufficient();
    error NotWon();
    error StableTransferFailed();

    constructor(address arena_, uint64 roundEnd_, string memory ticker_, address stable_, uint256 virtualStable_, uint16 penaltyBps_) {
        if (roundEnd_ <= block.timestamp) revert RoundOver();
        arena = arena_;
        stable = IERC20Min(stable_);
        roundStart = uint64(block.timestamp);
        roundEnd = roundEnd_;
        virtualStable = virtualStable_;
        penaltyBps = penaltyBps_;
        name = string.concat("$", ticker_, " on Base");
        symbol = ticker_;
    }

    /// Trading is open during the round, and again for good once this copy has won.
    function open() public view returns (bool) {
        return (block.timestamp < roundEnd && !released) || won;
    }

    // ------------------------------------------------------------------ trade

    function buy(uint256 amountIn, uint256 minTokensOut) external returns (uint256 out) {
        if (!open()) revert RoundOver();
        if (amountIn == 0) revert NothingIn();
        _pull(msg.sender, amountIn);
        out = _curveBuy(amountIn);
        if (out == 0 || out < minTokensOut) revert TooLittleOut();
        int256 added = 0;
        if (block.timestamp < roundEnd) {
            added = int256(amountIn * (roundEnd - block.timestamp));
            score += added;
        }
        _mint(msg.sender, out);
        emit Bought(msg.sender, amountIn, out, added);
    }

    function sell(uint256 tokens, uint256 minOut) external returns (uint256 paid) {
        if (!open()) revert RoundOver();
        if (tokens == 0 || balanceOf[msg.sender] < tokens) revert Insufficient();
        uint256 gross = ((virtualStable + reserve) * tokens) / (curveTokens + tokens);
        if (gross > reserve) gross = reserve;
        uint256 tax = won ? 0 : (gross * sellTaxBps()) / 10_000;
        paid = gross - tax;
        if (paid == 0 || paid < minOut) revert TooLittleOut();
        _burn(msg.sender, tokens);
        curveTokens += tokens;
        reserve -= paid;
        int256 added = 0;
        if (block.timestamp < roundEnd) {
            added = -int256(paid * (roundEnd - block.timestamp));
            score += added;
        }
        if (!stable.transfer(msg.sender, paid)) revert StableTransferFailed();
        emit Sold(msg.sender, tokens, paid, tax, added);
    }

    function sellTaxBps() public view returns (uint256) {
        if (block.timestamp >= roundEnd) return penaltyBps;
        return (uint256(penaltyBps) * (block.timestamp - roundStart)) / (roundEnd - roundStart);
    }

    // ------------------------------------------------------------------ verdicts from the NEAR arena

    function releaseDigest(address to) public view returns (bytes32) {
        return _digest(keccak256(abi.encode(RELEASE_TYPEHASH, to, uint256(1))));
    }

    function wonDigest() public view returns (bytes32) {
        return _digest(keccak256(abi.encode(WON_TYPEHASH, uint256(1))));
    }

    function grantDigest(address to, uint256 num, uint256 den, uint256 nonce) public view returns (bytes32) {
        return _digest(keccak256(abi.encode(GRANT_TYPEHASH, to, num, den, nonce)));
    }

    /// This copy lost: the whole reserve goes to `to`, once.
    function release(address to, bytes calldata signature) external {
        if (released || won) revert AlreadyDone();
        if (block.timestamp < roundEnd) revert RoundNotOver();
        if (_recover(releaseDigest(to), signature) != arena) revert NotSignedByArena();
        released = true;
        uint256 amount = stable.balanceOf(address(this));
        reserve = 0;
        if (!stable.transfer(to, amount)) revert StableTransferFailed();
        emit Released(to, amount);
    }

    /// This copy won: trading reopens and the loser's reserve can be absorbed.
    function markWon(bytes calldata signature) external {
        if (released || won) revert AlreadyDone();
        if (block.timestamp < roundEnd) revert RoundNotOver();
        if (_recover(wonDigest(), signature) != arena) revert NotSignedByArena();
        won = true;
        emit Won();
    }

    /// The losing copy's reserve arrives (swapped into the stablecoin). As in the bracket rules,
    /// `penaltyBps` of it stays in the curve as spoils with no tokens minted; the rest buys tokens
    /// that the losing copy's holders receive through `grant`. Closed once the first grant is made.
    function absorb(uint256 amount) external {
        if (!won) revert NotWon();
        if (grantBase != 0) revert AlreadyDone();
        if (amount == 0) revert NothingIn();
        _pull(msg.sender, amount);
        uint256 spoils = (amount * penaltyBps) / 10_000;
        reserve += spoils;
        uint256 out = _curveBuy(amount - spoils);
        _mint(address(this), out);
        absorbedTokens += out;
        absorbedStable += amount;
        emit Absorbed(msg.sender, amount, spoils, out);
    }

    /// Pays a holder of the losing copy `num/den` of the absorbed tokens, as signed by the NEAR arena.
    function grant(address to, uint256 num, uint256 den, uint256 nonce, bytes calldata signature) external {
        if (!won) revert NotWon();
        if (usedGrant[nonce]) revert AlreadyDone();
        if (den == 0 || num > den) revert Insufficient();
        if (_recover(grantDigest(to, num, den, nonce), signature) != arena) revert NotSignedByArena();
        if (grantBase == 0) grantBase = absorbedTokens;
        usedGrant[nonce] = true;
        uint256 tokens = (grantBase * num) / den;
        _transfer(address(this), to, tokens);
        emit Granted(to, tokens, nonce);
    }

    // ------------------------------------------------------------------ internals

    function _curveBuy(uint256 amountIn) private returns (uint256 out) {
        out = (curveTokens * amountIn) / (virtualStable + reserve + amountIn);
        curveTokens -= out;
        reserve += amountIn;
    }

    function _pull(address from, uint256 amount) private {
        if (!stable.transferFrom(from, address(this), amount)) revert StableTransferFailed();
    }

    function _digest(bytes32 structHash) private view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("HITCPool"), keccak256("1"), block.chainid, address(this))
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert BadSignature();
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (uint256(s) > HALF_ORDER || (v != 27 && v != 28)) revert BadSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
    }

    function transfer(address to, uint256 value) external returns (bool) {
        if (!open()) revert Frozen();
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (!open()) revert Frozen();
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert Insufficient();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) private {
        if (balanceOf[from] < value) revert Insufficient();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) private {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) private {
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }
}
