// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HITCPool, spike
/// @notice One EVM copy of a ticker in a cross-chain Heavy Is The Crown match: an ERC-20 on its own
/// constant-product curve, like the NEAR tokens. Buying mints, selling burns. Net inflow scores
/// `amount × seconds left in the round`, the same rule as the NEAR side. The sell tax ramps from 0 to
/// `penaltyBps` over the round and stays in the curve, so leaving at the bell costs what losing costs.
///
/// At the bell trading and transfers freeze, so balances at the bell are what holders of a losing copy
/// claim against on NEAR. Nobody owns this contract. Its reserve leaves only through `release`, signed
/// by `arena`: the EVM address NEAR Chain Signatures derives from the keyless NEAR arena contract.
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
    /// EVM address derived from the NEAR arena account (Chain Signatures).
    address public immutable arena;
    uint64 public immutable roundStart;
    uint64 public immutable roundEnd;
    uint256 public immutable virtualEth;
    uint16 public immutable penaltyBps;
    uint256 public constant CURVE_SUPPLY = 1_000_000_000 ether;

    /// Tokens still in the curve (CURVE_SUPPLY minus circulating supply).
    uint256 public curveTokens = CURVE_SUPPLY;
    /// ETH in the curve, tax included.
    uint256 public reserve;
    /// Σ net inflow × seconds left. Signed: selling more than came in scores negative.
    int256 public score;
    bool public released;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant RELEASE_TYPEHASH = keccak256("Release(address to,uint256 nonce)");
    uint256 private constant HALF_ORDER = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    event Bought(address indexed buyer, uint256 ethIn, uint256 tokensOut, int256 scoreAdded);
    event Sold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 tax, int256 scoreAdded);
    event Released(address indexed to, uint256 amount);

    error RoundOver();
    error RoundNotOver();
    error NothingAttached();
    error TooLittleOut();
    error AlreadyReleased();
    error NotSignedByArena();
    error BadSignature();
    error TransferFailed();
    error Frozen();
    error Insufficient();

    constructor(address arena_, uint64 roundEnd_, string memory ticker_, uint256 virtualEth_, uint16 penaltyBps_) {
        if (roundEnd_ <= block.timestamp) revert RoundOver();
        arena = arena_;
        roundStart = uint64(block.timestamp);
        roundEnd = roundEnd_;
        virtualEth = virtualEth_;
        penaltyBps = penaltyBps_;
        name = string.concat("$", ticker_, " on Base");
        symbol = ticker_;
    }

    // ------------------------------------------------------------------ trade

    function buy(uint256 minTokensOut) external payable returns (uint256 out) {
        if (block.timestamp >= roundEnd) revert RoundOver();
        if (msg.value == 0) revert NothingAttached();
        out = (curveTokens * msg.value) / (virtualEth + reserve + msg.value);
        if (out == 0 || out < minTokensOut) revert TooLittleOut();
        curveTokens -= out;
        reserve += msg.value;
        int256 added = int256(msg.value * (roundEnd - block.timestamp));
        score += added;
        _mint(msg.sender, out);
        emit Bought(msg.sender, msg.value, out, added);
    }

    function sell(uint256 tokens, uint256 minEthOut) external returns (uint256 paid) {
        if (block.timestamp >= roundEnd) revert RoundOver();
        if (tokens == 0 || balanceOf[msg.sender] < tokens) revert Insufficient();
        uint256 gross = ((virtualEth + reserve) * tokens) / (curveTokens + tokens);
        if (gross > reserve) gross = reserve;
        uint256 tax = (gross * sellTaxBps()) / 10_000;
        paid = gross - tax;
        if (paid == 0 || paid < minEthOut) revert TooLittleOut();
        _burn(msg.sender, tokens);
        curveTokens += tokens;
        reserve -= paid; // the tax stays in the curve
        int256 added = -int256(paid * (roundEnd - block.timestamp));
        score += added;
        (bool ok,) = msg.sender.call{value: paid}("");
        if (!ok) revert TransferFailed();
        emit Sold(msg.sender, tokens, paid, tax, added);
    }

    /// 0 at the start of the round, `penaltyBps` at the bell.
    function sellTaxBps() public view returns (uint256) {
        if (block.timestamp >= roundEnd) return penaltyBps;
        return (uint256(penaltyBps) * (block.timestamp - roundStart)) / (roundEnd - roundStart);
    }

    // ------------------------------------------------------------------ release

    /// EIP-712 hash of `Release(to, nonce = 1)`. The NEAR arena computes the same bytes.
    function releaseDigest(address to) public view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("HITCPool"), keccak256("1"), block.chainid, address(this))
        );
        bytes32 message = keccak256(abi.encode(RELEASE_TYPEHASH, to, uint256(1)));
        return keccak256(abi.encodePacked("\x19\x01", domain, message));
    }

    /// Anyone relays the arena's signature; the whole reserve goes to `to`, once.
    function release(address to, bytes calldata signature) external {
        if (released) revert AlreadyReleased();
        if (block.timestamp < roundEnd) revert RoundNotOver();
        if (_recover(releaseDigest(to), signature) != arena) revert NotSignedByArena();
        released = true;
        uint256 amount = address(this).balance;
        reserve = 0;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Released(to, amount);
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

    // ------------------------------------------------------------------ ERC-20 internals

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert Insufficient();
            allowance[from][msg.sender] = allowed - value;
        }
        _move(from, to, value);
        return true;
    }

    /// Balances freeze at the bell: they are the snapshot holders claim against.
    function _move(address from, address to, uint256 value) private {
        if (block.timestamp >= roundEnd) revert Frozen();
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
