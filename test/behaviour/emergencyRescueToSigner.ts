import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import Decimal from "decimal.js";
import logger from "../utils/logger";
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);

//this file should eventually test all the core features of the vault
export function shouldAllowEmergencyRescueToEOA(): void {
  before(
    "should revert to invested evm snapshot if snapshot exists",
    async function () {
      if (this.investedVaultSnapshot) {
        logger.debug(
          `Latest block timestamp before revert: ${new Date(
            (await this.provider.getBlock("latest")).timestamp * 1000
          ).toISOString()}`
        );
        const {
          amount: lpInMCV2BeforeRevert,
        } = await this.masterChefV2.userInfo(
          this.poolId,
          this.strategy.address
        );
        logger.debug(
          `lpInMCV2BeforeRevert: ${lpInMCV2BeforeRevert.div(stre18)}`
        );
        let revertStatus = await this.provider.send("evm_revert", [
          this.investedVaultSnapshot,
        ]);
        logger.debug(
          `Revert to ${this.investedVaultSnapshot} status: ${revertStatus}`
        );
        const {
          amount: lpInMCV2AfterRevert,
        } = await this.masterChefV2.userInfo(
          this.poolId,
          this.strategy.address
        );
        logger.debug(`lpInMCV2AfterRevert: ${lpInMCV2AfterRevert.div(stre18)}`);
        logger.debug(
          `Latest block timestamp after revert: ${new Date(
            (await this.provider.getBlock("latest")).timestamp * 1000
          ).toISOString()}`
        );
        this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
      }
    }
  );
  it("should allow creator to withdraw assets from masterchefv2 to signer", async function () {
    let vaultInvestedAt =
      this.vaultParams.startTime + this.vaultParams.enrollment;
    await provider.send("evm_mine", [vaultInvestedAt + 1000]);
    const callData = this.masterChefV2.interface.encodeFunctionData(
      "emergencyWithdraw",
      [this.poolId, this.accounts[0]]
    );
    const {
      amount: lpInMCV2BeforeEmergencyWithdraw,
    } = await this.masterChefV2.userInfo(this.poolId, this.strategy.address);
    const lpInAccountBeforeEmergencyWithdraw: string = (
      await this.poolContract.balanceOf(this.accounts[0])
    ).toString();
    const rewardInAccountBeforeEmergencyWithdraw: string = (
      await this.rewardTokenContract.balanceOf(this.accounts[0])
    ).toString();
    await this.strategy.multiexcall([
      { target: this.masterChefV2.address, data: callData },
    ]);
    const {
      amount: lpInMCV2AfterEmergencyWithdraw,
    } = await this.masterChefV2.userInfo(this.poolId, this.strategy.address);
    const lpInAccountAfterEmergencyWithdraw: string = (
      await this.poolContract.balanceOf(this.accounts[0])
    ).toString();
    const rewardInAccountAfterEmergencyWithdraw: string = (
      await this.rewardTokenContract.balanceOf(this.accounts[0])
    ).toString();

    logger.debug(
      `Number of lp tokens in MCV2 before and after emergency withdraw - before: ${ethers.BigNumber.from(
        lpInMCV2BeforeEmergencyWithdraw
      ).div(stre18)}, after: ${ethers.BigNumber.from(
        lpInMCV2AfterEmergencyWithdraw
      ).div(stre18)}`
    );
    logger.debug(
      `Number of lp tokens in signer[0] before and after emergency withdraw - before: ${ethers.BigNumber.from(
        lpInAccountBeforeEmergencyWithdraw
      ).div(stre18)}, after: ${ethers.BigNumber.from(
        lpInAccountAfterEmergencyWithdraw
      ).div(stre18)}`
    );
    logger.debug(
      `Number of reward tokens in signer[0] before and after emergency withdraw - before: ${ethers.BigNumber.from(
        rewardInAccountBeforeEmergencyWithdraw
      ).div(stre18)}, after: ${ethers.BigNumber.from(
        rewardInAccountAfterEmergencyWithdraw
      ).div(stre18)}`
    );
    expect(lpInMCV2BeforeEmergencyWithdraw).eq(
      lpInAccountAfterEmergencyWithdraw
    ); //all LP from mcv2 must end up in the strategy
    expect(lpInMCV2AfterEmergencyWithdraw).eq(0); //LP balance in MCV2 myst be 0 after emergency withdraw
    if (this.rewardTokensEmittedOnEmergencyWithdraw) {
      expect(ethers.BigNumber.from(rewardInAccountBeforeEmergencyWithdraw)).lt(
        ethers.BigNumber.from(rewardInAccountAfterEmergencyWithdraw)
      );
    }
  });
}
