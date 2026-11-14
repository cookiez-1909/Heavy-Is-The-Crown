// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HITCPool} from "../src/HITCPool.sol";

contract HITCPoolTest is Test {
    uint256 internal arenaKey = 0xA11CE;
    address internal arena;
    address internal escrow = address(0x2222222222222222222222222222222222222222);
    address internal alice = address(0xA1);
    address internal bob = address(0xB0);
    HITCPool internal pool;

    function setUp() public {
        arena = vm.addr(arenaKey);
        vm.warp(1_000);
        pool = new HITCPool(arena, 1_600, "HUANG", 0.01 ether, 1500);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_buyMintsOnTheCurveAndScores() public {
        vm.warp(1_100);
        vm.prank(alice);
        uint256 out = pool.buy{value: 0.01 ether}(0);
        // x*y=k from 0.01 virtual ETH: half the curve for the first 0.01 ETH
        assertEq(out, 500_000_000 ether);
        assertEq(pool.balanceOf(alice), out);
        assertEq(pool.totalSupply(), out);
        assertEq(pool.reserve(), 0.01 ether);
        assertEq(pool.score(), int256(0.01 ether * 500));
    }

    function test_sellBurnsPaysLessTheTaxAndScoresNegative() public {
        vm.prank(alice);
        uint256 out = pool.buy{value: 0.01 ether}(0);
        vm.warp(1_300); // half way: tax 7.5%
        assertEq(pool.sellTaxBps(), 750);
        uint256 before = alice.balance;
        vm.prank(alice);
        uint256 paid = pool.sell(out, 0);
        uint256 gross = 0.01 ether; // selling everything returns the whole reserve
        assertEq(paid, gross - (gross * 750) / 10_000);
        assertEq(alice.balance - before, paid);
        assertEq(pool.totalSupply(), 0);
        assertEq(pool.reserve(), gross - paid); // the tax stays
        assertEq(pool.score(), int256(0.01 ether * 600) - int256(paid * 300));
    }

    function test_taxIsThePenaltyAtTheBell() public {
        vm.warp(1_599);
        assertLt(pool.sellTaxBps(), 1500);
        vm.warp(1_600);
        assertEq(pool.sellTaxBps(), 1500);
    }

    function test_tradingAndTransfersFreezeAtTheBell() public {
        vm.prank(alice);
        pool.buy{value: 1 ether}(0);
        vm.warp(1_600);
        vm.prank(bob);
        vm.expectRevert(HITCPool.RoundOver.selector);
        pool.buy{value: 1}(0);
        vm.prank(alice);
        vm.expectRevert(HITCPool.RoundOver.selector);
        pool.sell(1, 0);
        vm.prank(alice);
        vm.expectRevert(HITCPool.Frozen.selector);
        pool.transfer(bob, 1);
    }

    function test_slippageGuard() public {
        vm.prank(alice);
        vm.expectRevert(HITCPool.TooLittleOut.selector);
        pool.buy{value: 0.01 ether}(600_000_000 ether);
    }

    function test_arenaSignatureReleasesTheWholeReserve() public {
        vm.prank(alice);
        pool.buy{value: 1 ether}(0);
        vm.warp(1_600);
        bytes memory sig = sign(arenaKey, pool.releaseDigest(escrow));
        pool.release(escrow, sig);
        assertEq(escrow.balance, 1 ether);
        assertEq(address(pool).balance, 0);
        assertEq(pool.reserve(), 0);
        vm.expectRevert(HITCPool.AlreadyReleased.selector);
        pool.release(escrow, sig);
    }

    function test_anyOtherSignerIsRejected() public {
        vm.prank(alice);
        pool.buy{value: 1 ether}(0);
        vm.warp(1_600);
        bytes memory sig = sign(0xBAD, pool.releaseDigest(escrow));
        vm.expectRevert(HITCPool.NotSignedByArena.selector);
        pool.release(escrow, sig);
    }

    function test_signatureIsBoundToTheRecipient() public {
        vm.prank(alice);
        pool.buy{value: 1 ether}(0);
        vm.warp(1_600);
        bytes memory sig = sign(arenaKey, pool.releaseDigest(escrow));
        vm.expectRevert(HITCPool.NotSignedByArena.selector);
        pool.release(address(0xBEEF), sig);
    }

    function test_noReleaseBeforeTheBell() public {
        bytes memory sig = sign(arenaKey, pool.releaseDigest(escrow));
        vm.expectRevert(HITCPool.RoundNotOver.selector);
        pool.release(escrow, sig);
    }

    /// Same inputs as `release_digest_vector` in the NEAR contract (crosschain/xarena).
    function test_digestMatchesTheNearSide() public {
        vm.chainId(84532);
        address at = address(0x1111111111111111111111111111111111111111);
        deployCodeTo("HITCPool.sol:HITCPool", abi.encode(arena, uint64(1_600), "HUANG", uint256(0.01 ether), uint16(1500)), at);
        assertEq(
            HITCPool(at).releaseDigest(escrow),
            0xb9bcdcb209dd26e4862a7265458b9d666c04403449db22b22b783b778868c096
        );
    }
}
