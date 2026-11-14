// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HITCPool} from "../src/HITCPool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract HITCPoolTest is Test {
    uint256 internal arenaKey = 0xA11CE;
    address internal arena;
    address internal escrow = address(0x2222222222222222222222222222222222222222);
    address internal alice = address(0xA1);
    address internal bob = address(0xB0);
    MockUSDC internal usdc;
    HITCPool internal pool;

    function setUp() public {
        arena = vm.addr(arenaKey);
        vm.warp(1_000);
        usdc = new MockUSDC();
        pool = new HITCPool(arena, 1_600, "HUANG", address(usdc), 10e6, 1500);
        for (uint256 i = 0; i < 3; i++) {
            address who = [alice, bob, address(this)][i];
            usdc.mint(who, 1_000e6);
            vm.prank(who);
            usdc.approve(address(pool), type(uint256).max);
        }
    }

    function sign(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(arenaKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_buyMintsOnTheCurveAndScoresInUsdc() public {
        vm.warp(1_100);
        vm.prank(alice);
        uint256 out = pool.buy(10e6, 0);
        assertEq(out, 500_000_000 ether); // half the curve for the first 10 tUSDC of 10 virtual
        assertEq(pool.reserve(), 10e6);
        assertEq(usdc.balanceOf(address(pool)), 10e6);
        assertEq(pool.score(), int256(10e6 * 500));
    }

    function test_sellPaysLessTheRampingTax() public {
        vm.prank(alice);
        uint256 out = pool.buy(10e6, 0);
        vm.warp(1_300);
        vm.prank(alice);
        uint256 paid = pool.sell(out, 0);
        assertEq(paid, 10e6 - (10e6 * 750) / 10_000);
        assertEq(pool.reserve(), 10e6 - paid);
    }

    function test_frozenAtTheBell() public {
        vm.prank(alice);
        pool.buy(10e6, 0);
        vm.warp(1_600);
        vm.prank(bob);
        vm.expectRevert(HITCPool.RoundOver.selector);
        pool.buy(1e6, 0);
        vm.prank(alice);
        vm.expectRevert(HITCPool.Frozen.selector);
        pool.transfer(bob, 1);
    }

    function test_releaseSendsTheWholeReserveOnce() public {
        vm.prank(alice);
        pool.buy(30e6, 0);
        vm.warp(1_600);
        pool.release(escrow, sign(pool.releaseDigest(escrow)));
        assertEq(usdc.balanceOf(escrow), 30e6);
        assertEq(usdc.balanceOf(address(pool)), 0);
        bytes memory wonSig = sign(pool.wonDigest());
        vm.expectRevert(HITCPool.AlreadyDone.selector);
        pool.markWon(wonSig);
    }

    function test_wonReopensTradingAbsorbsAndGrants() public {
        vm.prank(alice);
        pool.buy(10e6, 0);
        vm.warp(1_600);
        pool.markWon(sign(pool.wonDigest()));
        assertTrue(pool.open());

        // the loser's reserve arrives: 15% spoils, 85% buys tokens held for its holders
        pool.absorb(20e6);
        assertEq(pool.absorbedStable(), 20e6);
        assertEq(pool.reserve(), 10e6 + 20e6);
        uint256 held = pool.absorbedTokens();
        assertGt(held, 0);
        assertEq(pool.balanceOf(address(pool)), held);

        // two NEAR holders, 3/4 and 1/4
        pool.grant(alice, 3, 4, 1, sign(pool.grantDigest(alice, 3, 4, 1)));
        pool.grant(bob, 1, 4, 2, sign(pool.grantDigest(bob, 1, 4, 2)));
        assertEq(pool.balanceOf(alice) - 500_000_000 ether, (held * 3) / 4);
        assertEq(pool.balanceOf(bob), held / 4);

        // after the first grant the base is fixed; no more absorbing, no replays
        vm.expectRevert(HITCPool.AlreadyDone.selector);
        pool.absorb(1e6);
        bytes memory again = sign(pool.grantDigest(bob, 1, 4, 2));
        vm.expectRevert(HITCPool.AlreadyDone.selector);
        pool.grant(bob, 1, 4, 2, again);

        // the winner trades again, tax free
        vm.prank(bob);
        pool.sell(held / 4, 0);
    }

    function test_grantIsBoundToRecipientAndShare() public {
        vm.warp(1_600);
        pool.markWon(sign(pool.wonDigest()));
        pool.absorb(20e6);
        bytes memory sig = sign(pool.grantDigest(alice, 1, 2, 7));
        vm.expectRevert(HITCPool.NotSignedByArena.selector);
        pool.grant(bob, 1, 2, 7, sig);
        vm.expectRevert(HITCPool.NotSignedByArena.selector);
        pool.grant(alice, 2, 2, 7, sig);
    }

    function test_noGrantOrAbsorbBeforeWon() public {
        vm.expectRevert(HITCPool.NotWon.selector);
        pool.absorb(1e6);
        bytes memory sig = sign(pool.grantDigest(alice, 1, 1, 1));
        vm.expectRevert(HITCPool.NotWon.selector);
        pool.grant(alice, 1, 1, 1, sig);
    }

    function test_onlyTheArenaSigns() public {
        vm.warp(1_600);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, pool.wonDigest());
        vm.expectRevert(HITCPool.NotSignedByArena.selector);
        pool.markWon(abi.encodePacked(r, s, v));
    }

    function test_noVerdictBeforeTheBell() public {
        bytes memory sig = sign(pool.wonDigest());
        vm.expectRevert(HITCPool.RoundNotOver.selector);
        pool.markWon(sig);
    }

    /// Vectors shared with crosschain/xarena: chain 84532, pool at 0x1111…, escrow 0x2222….
    function test_digestsMatchTheNearSide() public {
        vm.chainId(84532);
        address at = address(0x1111111111111111111111111111111111111111);
        deployCodeTo(
            "HITCPool.sol:HITCPool",
            abi.encode(arena, uint64(1_600), "HUANG", address(usdc), uint256(10e6), uint16(1500)),
            at
        );
        HITCPool p = HITCPool(at);
        assertEq(p.releaseDigest(escrow), 0xb9bcdcb209dd26e4862a7265458b9d666c04403449db22b22b783b778868c096);
        emit log_named_bytes32("won", p.wonDigest());
        emit log_named_bytes32("grant(0x3333.., 3, 4, 9)", p.grantDigest(address(0x3333333333333333333333333333333333333333), 3, 4, 9));
    }
}
