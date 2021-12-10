import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { getVaultId } from "../../../scripts/utils/helpers";
import { computeHarvestAt } from "../../utils/gen-utils";
import Decimal from "decimal.js";
import logger from "../../utils/logger";
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
//this file should eventually test all the core features of the strategy
export function shouldBehaveLikeAUniswapStrategyDuringHarvestAndRedeem(): void {
  before(
    "should revert to invested evm snapshot if snapshot exists",
    async function () {
      if (this.investedVaultSnapshot) {
        logger.debug(
          `Latest block timestamp before revert: ${new Date(
            (await this.provider.getBlock("latest")).timestamp * 1000
          ).toISOString()}`
        );
        let revertStatus = await this.provider.send("evm_revert", [
          this.investedVaultSnapshot,
        ]);
        this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
        logger.debug(
          `Revert to ${this.investedVaultSnapshot} status: ${revertStatus}`
        );
        logger.debug(
          `Latest block timestamp after revert: ${new Date(
            (await this.provider.getBlock("latest")).timestamp * 1000
          ).toISOString()}`
        );
      }
    }
  );
  it("should increase the amount of lp tokens in staking contract when harvest in strategy is called", async function () {
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
      await this.strategy.harvest(0);
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
    ).to.be.revertedWith("Too much slippage");
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
    ).div(this.srDecimalsFactor);
    const juniorAmountRedeemed = ethers.BigNumber.from(
      amountsRedeemed[1].toString()
    ).div(this.jrDecimalsFactor);
    await this.vault.redeem(this.vaultId, 0, 0);
    logger.info(
      `${await this.seniorTokenContract.symbol()} Redeemed: ${seniorAmountRedeemed}, ${await this.juniorTokenContract.symbol()}  Redeemed: ${juniorAmountRedeemed.toString()}`
    );
    expect(amountsRedeemed[0].toString()).gt(
      ethers.BigNumber.from(this.seniorInvested).mul(this.srDecimalsFactor)
    );
    if (this.juniorsLoseAll) {
      expect(juniorAmountRedeemed).eq(0);
    } else {
      if (this.juniorLoses) {
        expect(amountsRedeemed[1].toString()).lt(
          ethers.BigNumber.from(this.juniorInvested).mul(this.jrDecimalsFactor)
        );
      } else {
        expect(amountsRedeemed[1].toString()).gt(
          ethers.BigNumber.from(this.juniorInvested).mul(this.jrDecimalsFactor)
        );
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
