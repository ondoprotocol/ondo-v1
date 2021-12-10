import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { getVaultId } from "../../../scripts/utils/helpers";
import { buyTokensWithTokens, computeHarvestAt } from "../../utils/gen-utils";
import Decimal from "decimal.js";
import logger from "../../utils/logger";
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
//this file should eventually test all the core features of the strategy
export function shouldBehaveLikeStrategyDuringPathChanges(): void {
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
      let vaultToBeRedeemedAt =
        this.vaultParams.startTime +
        this.vaultParams.enrollment +
        this.vaultParams.duration;
      await this.provider.send("evm_mine", [vaultToBeRedeemedAt + 10000]);
      await this.vault.claim(this.vaultId, 0);
      for (let i = 0; i < this.tradesCount; i++) {
        await buyTokensWithTokens(
          this.signers[0],
          this.accounts[0],
          this.buyTokenWithTokenPath,
          this.jrToTrade,
          this.srToTrade,
          0,
          this.routerContract,
          this.sellTokenContract,
          this.buyTokenContract,
          true
        );
        await buyTokensWithTokens(
          this.signers[0],
          this.accounts[0],
          await this.buyTokenWithTokenPath.reverse(),
          this.srToTrade - this.srToTradeDelta,
          this.jrToTrade,
          0,
          this.routerContract,
          this.buyTokenContract,
          this.sellTokenContract,
          true
        );
        this.buyTokenWithTokenPath.reverse();
      }
    }
  );
  it("should increase both sr and jr values on redeem", async function () {
    logger.debug(
      `Redeem Block time: ${new Date(
        (await this.provider.getBlock("latest")).timestamp * 1000
      ).toISOString()}`
    );
    await this.strategy.setPathJuniorToSenior(this.newPathJrToSr);
    await this.strategy.setPathSeniorToJunior(this.newPathSrToJr);
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
      `${await this.seniorTokenContract.symbol()} Redeemed: ${seniorAmountRedeemed}, ${await this.juniorTokenContract.symbol()}  Redeemed: ${juniorAmountRedeemed}`
    );
    expect(seniorAmountRedeemed).gte(this.seniorInvested);
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
