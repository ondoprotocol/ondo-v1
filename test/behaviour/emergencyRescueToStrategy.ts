import { expect } from "chai";
import { createVault } from "../../scripts/utils/helpers";
import { deployments, ethers } from "hardhat";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";
import logger from "../utils/logger";
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);

//this file should eventually test all the core features of the vault
export function shouldAllowEmergencyRescue(): void {
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
  it("should allow creator to withdraw assets from masterchefv2 to strategy", async function () {
    let vaultInvestedAt =
      this.vaultParams.startTime + this.vaultParams.enrollment;
    await provider.send("evm_mine", [vaultInvestedAt + 1000]);
    const encoded = this.masterChefV2.interface.encodeFunctionData(
      "emergencyWithdraw",
      [this.poolId, this.strategy.address]
    );
    const {
      amount: lpInMCV2BeforeEmergencyWithdraw,
    } = await this.masterChefV2.userInfo(this.poolId, this.strategy.address);
    const lpInStrategyBeforeEmergencyWithdraw: string = (
      await this.poolContract.balanceOf(this.strategy.address)
    ).toString();
    const rewardInStrategyBeforeEmergencyWithdraw: string = (
      await this.rewardTokenContract.balanceOf(this.strategy.address)
    ).toString();
    await this.strategy.multiexcall([
      { target: this.masterChefV2.address, data: encoded },
    ]);
    const {
      amount: lpInMCV2AfterEmergencyWithdraw,
    } = await this.masterChefV2.userInfo(this.poolId, this.strategy.address);
    const lpInStrategyAfterEmergencyWithdraw: string = (
      await this.poolContract.balanceOf(this.strategy.address)
    ).toString();
    const rewardInStrategyAfterEmergencyWithdraw: string = (
      await this.rewardTokenContract.balanceOf(this.strategy.address)
    ).toString();

    logger.debug(
      `Number of lp tokens in MCV2 before and after emergency withdraw - before: ${ethers.BigNumber.from(
        lpInMCV2BeforeEmergencyWithdraw
      ).div(stre18)}, after: ${ethers.BigNumber.from(
        lpInMCV2AfterEmergencyWithdraw
      ).div(stre18)}`
    );
    logger.debug(
      `Number of lp tokens in strategy before and after emergency withdraw - before: ${ethers.BigNumber.from(
        lpInStrategyBeforeEmergencyWithdraw
      ).div(stre18)}, after: ${ethers.BigNumber.from(
        lpInStrategyAfterEmergencyWithdraw
      ).div(stre18)}`
    );
    logger.debug(
      `Number of reward tokens in strategy before and after emergency withdraw - before: ${ethers.BigNumber.from(
        rewardInStrategyBeforeEmergencyWithdraw
      ).div(stre18)}, after: ${ethers.BigNumber.from(
        rewardInStrategyAfterEmergencyWithdraw
      ).div(stre18)}`
    );
    expect(lpInMCV2BeforeEmergencyWithdraw).eq(
      lpInStrategyAfterEmergencyWithdraw
    ); //all LP from mcv2 must end up in the strategy
    expect(lpInMCV2AfterEmergencyWithdraw).eq(0); //LP balance in MCV2 myst be 0 after emergency withdraw
    if (this.rewardTokensEmittedOnEmergencyWithdraw) {
      expect(ethers.BigNumber.from(rewardInStrategyBeforeEmergencyWithdraw)).lt(
        ethers.BigNumber.from(rewardInStrategyAfterEmergencyWithdraw)
      );
    }
  });
  it("should not allow any one other than creator to withdraw LP tokens from mcv2", async function () {
    const encoded = this.masterChefV2.interface.encodeFunctionData(
      "emergencyWithdraw",
      [this.poolId, this.strategy.address]
    );
    await expect(
      this.strategy
        .connect(this.signers[1])
        .multiexcall([{ target: this.masterChefV2.address, data: encoded }])
    ).to.be.revertedWith("Unauthorized");
  });
  it("should allow guardian role to rescue the LP tokens withdrawn from mcv2", async function () {
    const lpInStrategyBeforeRescue: string = (
      await this.poolContract.balanceOf(this.strategy.address)
    ).toString();
    await this.strategy.pause();
    await this.strategy.rescueTokens([this.poolContract.address], [0]);
    const lpInSignerAfterRescue: string = (
      await this.poolContract.balanceOf(this.signers[0].address)
    ).toString();
    expect(lpInStrategyBeforeRescue).eq(lpInSignerAfterRescue); //all LP from mcv2 must end up in the strategy
  });
  it("should not allow anyone other than guardian role to rescue the LP tokens withdrawn from mcv2", async function () {
    await expect(
      this.strategy
        .connect(this.signers[1])
        .rescueTokens([this.poolContract.address], [0])
    ).to.be.revertedWith("Unauthorized");
  });
}
