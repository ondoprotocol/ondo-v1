import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";
import * as logger from "../../utils/logger";

let harvestAt: number;
let investAt: number;
let createAt: number;
let vaultId: BigNumber;
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);

//this file should eventually test all the core features of the vault
export function shouldBehaveLikeVaultDuringUniv2Investments() {
  it("should allow strategist to invest - On invest one asset should go to 0", async function () {
    await provider.send("evm_mine", [this.investAt]); //forward the clock to investAt time to prepare for invest
    let amounts = await this.vault.callStatic.invest(this.vaultId, 0, 0);
    this.seniorInvested = ethers.BigNumber.from(amounts[0]).div(
      `${this.srDecimalsFactor}`
    );
    this.juniorInvested = ethers.BigNumber.from(amounts[1]).div(
      this.jrDecimalsFactor
    );
    logger.info(
      `${this.vaultParams.seniorSym} Amount Invested: ${this.seniorInvested}, ${
        this.vaultParams.juniorSym
      } Amount Invested: ${this.juniorInvested} at ${new Date(
        this.investAt * 1000
      ).toISOString()}`
    );
    await this.vault.invest(this.vaultId, 0, 0);
    const jrLeftOverInStrategyAfterInvest: string = (
      await this.juniorTokenContract.balanceOf(this.strategy.address)
    ).toString();
    const srLeftOverInStrategyAfterInvest: string = (
      await this.seniorTokenContract.balanceOf(this.strategy.address)
    ).toString();
    logger.debug(
      `${await this.juniorTokenContract.symbol()} balance in strategy after invest: ${ethers.BigNumber.from(
        jrLeftOverInStrategyAfterInvest
      ).div(this.jrDecimalsFactor)}`
    );
    logger.debug(
      `${await this.seniorTokenContract.symbol()} balance in strategy after invest: ${ethers.BigNumber.from(
        srLeftOverInStrategyAfterInvest
      ).div(this.srDecimalsFactor)}`
    );
    expect(
      jrLeftOverInStrategyAfterInvest === "0" ||
        srLeftOverInStrategyAfterInvest === "0"
    );
    this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
  });
}
