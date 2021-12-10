import { expect } from "chai";
import { ethers } from "hardhat";
import { computeHarvestAt } from "../utils/gen-utils";
import Decimal from "decimal.js";
import logger from "../utils/logger";
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
//this file should eventually test all the core features of the strategy
export function shouldBehaveLikeDualRewardStrategyDuringHarvestAndRedeem(
  vaultCount: number
): void {
  it("should increase the amount of lp tokens in masterchef when harvest in strategy is called", async function () {
    let harvestCount: number = 1;
    this.harvestAt = undefined; //reset harvest at as this test will be invoked with multiple scenarios
    let vaultInvestedAt =
      this.vaultParams.startTime + this.vaultParams.enrollment;
    let vaultToBeRedeemedAt =
      this.vaultParams.startTime +
      this.vaultParams.enrollment +
      this.vaultParams.duration;
    while (true) {
      //harvest continuously until the vault is redeemed
      this.harvestAt = await computeHarvestAt(
        vaultInvestedAt,
        this.harvestAt,
        this.harvestWaitDays
      );
      logger.debug(
        `Harvesting the vault at ${new Date(
          this.harvestAt * 1000
        ).toISOString()} . This vault was invested at: ${new Date(
          vaultInvestedAt * 1000
        ).toISOString()}`
      );

      if (this.harvestAt >= vaultToBeRedeemedAt) {
        logger.info(
          `Breaking at ${harvestCount}th harvest as the harvest time is beyond redeem time.`
        );
        break;
      } else {
        logger.info(`Harvest count: ${harvestCount}`);
      }
      harvestCount++;
      await this.provider.send("evm_mine", [this.harvestAt]);
      logger.debug(
        `Harvesting at: ${new Date(
          (await this.provider.getBlock("latest")).timestamp * 1000
        ).toISOString()}`
      );
      const {
        amount: lpInMCV2BeforeHarvest,
      } = await this.masterChefV2.userInfo(this.poolId, this.strategy.address);
      const poolDataBefore = await this.strategy.pools(this.slp);
      let sharesBefore = [];
      let sharesAfter = [];
      for (let i = 0; i < vaultCount; i++) {
        // harvest multiple vaults
        sharesBefore.push(
          await this.strategy
            .vaults(this.vaults[i])
            .then((vault: any) => new Decimal(vault.shares.toString()))
        );
      }
      /***********Harvest - start***************** */
      await this.strategy.harvest(this.slp, 0);
      /***********Harvest - end***************** */
      for (let i = 0; i < vaultCount; i++) {
        // harvest multiple vaults
        sharesAfter.push(
          await this.strategy
            .vaults(this.vaults[i])
            .then((vault: any) => new Decimal(vault.shares.toString()))
        );
      }
      const poolDataAfter = await this.strategy.pools(this.slp);
      expect(poolDataBefore.totalLp).lt(poolDataAfter.totalLp); //total LP must increase after harvest
      for (let i = 0; i < vaultCount; i++) {
        // harvest multiple vaults
        expect(new Decimal(sharesBefore[i]).toNumber()).eq(
          new Decimal(sharesAfter[i]).toNumber()
        ); //no change to the number of shares for this vault
      }
      const { amount: lpInMCV2AfterHarvest } = await this.masterChefV2.userInfo(
        this.poolId,
        this.strategy.address
      );
      let lpValueIncrease: Decimal = new Decimal(
        ethers.BigNumber.from(lpInMCV2AfterHarvest)
          .sub(lpInMCV2BeforeHarvest)
          .toString()
      ).div(stre18);
      if (lpValueIncrease.lt(this.warnLPHarvestThreshold || 1)) {
        logger.warn(
          `LP balance increased MCV2 after harvest: ${lpValueIncrease}`
        );
      }
      if (harvestCount > 2) {
        expect(lpInMCV2AfterHarvest).gt(lpInMCV2BeforeHarvest);
      }
    }
  });
  it("should increase both sr and jr values on redeem", async function () {
    logger.debug(
      `Redeem Block time: ${new Date(
        (await this.provider.getBlock("latest")).timestamp * 1000
      ).toISOString()}`
    );
    await this.provider.send("evm_mine", [this.harvestAt + 10000]);
    for (let i = 0; i < vaultCount; i++) {
      // harvest multiple vaults
      const amountsRedeemed = await this.vault.callStatic.redeem(
        this.vaults[i],
        0,
        0
      );
      const seniorAmountRedeemed = ethers.BigNumber.from(
        amountsRedeemed[0].toString()
      ).div(stre18);
      const juniorAmountRedeemed = ethers.BigNumber.from(
        amountsRedeemed[1].toString()
      ).div(stre18);
      const poolDataBefore = await this.strategy.pools(this.slp);
      const sharesBefore = await this.strategy
        .vaults(this.vaults[i])
        .then((vault: any) => new Decimal(vault.shares.toString()));
      await this.vault.redeem(this.vaults[i], 0, 0);
      const sharesAfter = await this.strategy
        .vaults(this.vaults[i])
        .then((vault: any) => new Decimal(vault.shares.toString()));
      const poolDataAfter = await this.strategy.pools(this.slp);
      logger.info(
        `${await this.seniorTokenContract.symbol()} Redeemed: ${seniorAmountRedeemed}, ${await this.juniorTokenContract.symbol()}  Redeemed: ${juniorAmountRedeemed}`
      );
      expect(poolDataBefore.totalLp).gt(0);
      if (i < vaultCount - 1) {
        expect(poolDataAfter.totalLp).gt(0); //total LP must be greater than 0, this will be 0 if only one vault is created
      } else {
        expect(poolDataAfter.totalLp).eq(0);
      }
      expect(new Decimal(sharesBefore).toNumber()).gt(0);
      expect(new Decimal(sharesAfter).toNumber()).eq(0); //total shares must be 0 as this is the only vault created
      expect(seniorAmountRedeemed).gt(this.seniorInvested[i]);
      if (this.juniorsLoseAll) {
        expect(juniorAmountRedeemed).eq(0);
      } else {
        if (this.juniorLoses) {
          expect(juniorAmountRedeemed).lt(this.juniorInvested[i]);
        } else {
          expect(juniorAmountRedeemed).gt(this.juniorInvested[i]);
        }
      }
    }
  });
}
