import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { getVaultId } from "../../scripts/utils/helpers";
import { computeHarvestAt } from "../utils/gen-utils";
import Decimal from "decimal.js";
import logger from "../utils/logger";
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
//this file should eventually test all the core features of the strategy
export function shouldBehaveLikeDualRewardStrategyDuringHarvestAndRedeem(): void {
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
        this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
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
      }
    }
  );
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
      const sharesBefore = await this.strategy
        .vaults(this.vaultId)
        .then((vault: any) => new Decimal(vault.shares.toString()));
      await this.strategy.harvest(this.slp, 0);
      const sharesAfter = await this.strategy
        .vaults(this.vaultId)
        .then((vault: any) => new Decimal(vault.shares.toString()));
      const poolDataAfter = await this.strategy.pools(this.slp);
      expect(poolDataBefore.totalLp).lt(poolDataAfter.totalLp); //total LP must increase after harvest
      expect(new Decimal(sharesBefore).toNumber()).eq(
        new Decimal(sharesAfter).toNumber()
      ); //no change to the number of shares for this vault

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
  it("should not redeem if the slippage is too high", async function () {
    let vaultToBeRedeemedAt =
      this.vaultParams.startTime +
      this.vaultParams.enrollment +
      this.vaultParams.duration;
    await this.provider.send("evm_mine", [vaultToBeRedeemedAt + 10000]);
    const amountsRedeemed = await this.vault.callStatic.redeem(
      this.vaultId,
      0,
      0
    );
    await expect(
      this.vault.redeem(
        this.vaultId,
        amountsRedeemed[0] + 1,
        amountsRedeemed[1] + 1
      )
    ).to.be.revertedWith("Exceeds maximum slippage");
  });
  it("should increase both sr and jr values on redeem", async function () {
    logger.debug(
      `Redeem Block time: ${new Date(
        (await this.provider.getBlock("latest")).timestamp * 1000
      ).toISOString()}`
    );
    const amountsRedeemed = await this.vault.callStatic.redeem(
      this.vaultId,
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
      .vaults(this.vaultId)
      .then((vault: any) => new Decimal(vault.shares.toString()));
    await this.vault.redeem(this.vaultId, 0, 0);
    const sharesAfter = await this.strategy
      .vaults(this.vaultId)
      .then((vault: any) => new Decimal(vault.shares.toString()));
    const poolDataAfter = await this.strategy.pools(this.slp);
    logger.info(
      `${await this.seniorTokenContract.symbol()} Redeemed: ${seniorAmountRedeemed}, ${await this.juniorTokenContract.symbol()}  Redeemed: ${juniorAmountRedeemed}`
    );
    expect(poolDataBefore.totalLp).gt(0);
    expect(poolDataAfter.totalLp).eq(0); //total LP must be 0 as this is the only vault created
    expect(new Decimal(sharesBefore).toNumber()).gt(0);
    expect(new Decimal(sharesAfter).toNumber()).eq(0); //total shares must be 0 as this is the only vault created
    expect(seniorAmountRedeemed).gt(this.seniorInvested);
    if (this.juniorsLoseAll) {
      expect(juniorAmountRedeemed).eq(0);
    } else {
      if (this.juniorLoses) {
        expect(juniorAmountRedeemed).lt(this.juniorInvested);
      } else {
        expect(juniorAmountRedeemed).gt(this.juniorInvested);
      }
    }
  });
  it("should calculate the correct amount of shares for given number of lp tokens", async function () {});
  it("should calculate the correct amount of lptokens for given number of shares", async function () {});
  it("should not compound if sushi rewards and second rewards are less than 10000", async function () {});
  it("should convert all the sushi to the end asset in path[0] in pool and all reward tokens to the end asset path[1] in the pool and invest into LP", async function () {
    //to think how precision can be achieved here
  });
  it("should be able to get more LP with better reward paths. eg., instead of [[sushi,DAI],[LDO,ETH,DAI,WSTETH]] we should be able to use [[sushi,DAI],[LDO,ETH,DAI]]", async function () {
    //to think how precision can be achieved here
  });
  it("should be able to compound with senior uninvested leftover", async function () {});
  it("should be able to compound with junior uninvested leftover", async function () {});
  it("should be able to compound with no uninvested leftover", async function () {});
  it("should be able to compound when tokenA is leftover after investing both rewards into LP", async function () {});
  it("should be able to compound when tokenB is leftover  after investing both rewards into LP", async function () {});
}
