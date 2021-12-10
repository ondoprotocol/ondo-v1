import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";
import { ERC20 } from "../../typechain";
import logger from "../utils/logger";
import { mainnet } from "../../scripts/utils/addresses";

let harvestAt: number;
let investAt: number;
let createAt: number;
let vaultId: BigNumber;
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const lpTokenCount: number = 100;
const e = new Decimal(10).pow(34).mul(lpTokenCount);
const stre = e.toFixed(0);

//this file should eventually test all the core features of the vault
export function shouldBehaveLikeVaultDuringMidtermDeposits(): void {
  let vaultDetails;
  let srTrancheToken: string;
  let jrTrancheToken: string;
  let jrTrancheTokenContract: ERC20;
  let srTrancheTokenContract: ERC20;

  before("should enable tranche tokens", async function () {
    await this.provider.send("evm_revert", [this.investedVaultSnapshot]);
    this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
    await this.registryContract.enableTokens();
    vaultDetails = await this.vault.getVaultById(this.vaultId);
    srTrancheToken = vaultDetails.assets[0].trancheToken;
    jrTrancheToken = vaultDetails.assets[1].trancheToken;
    jrTrancheTokenContract = await ethers.getContractAt(
      "TrancheToken",
      jrTrancheToken
    );
    srTrancheTokenContract = await ethers.getContractAt(
      "TrancheToken",
      srTrancheToken
    );
  });

  it("should allow investors to claim senior tranche tokens and excess", async function () {
    let signer5Excess: Decimal =
      (
        await this.vault.connect(this.signers[5]).vaultInvestor(this.vaultId, 0)
      )[2]
        .div(stre18)
        .toNumber() === 0
        ? (
            await this.vault
              .connect(this.signers[5])
              .vaultInvestor(this.vaultId, 1)
          )[2]
        : (
            await this.vault
              .connect(this.signers[5])
              .vaultInvestor(this.vaultId, 0)
          )[2];
    let signer5Invested: Decimal = (
      await this.vault.connect(this.signers[5]).vaultInvestor(this.vaultId, 0)
    )[0];

    let trancheBalanceBeforeClaimingExcess;
    let trancheBalanceAfterClaimingExcess;
    let tokenBalanceBeforeClaimingExcess;
    let tokenBalanceAfterClaimingExcess;

    if (signer5Excess.gt(0) || signer5Invested.gt(0)) {
      trancheBalanceBeforeClaimingExcess = (
        await srTrancheTokenContract.balanceOf(this.accounts[5])
      )
        .div(stre18)
        .toNumber();
      tokenBalanceBeforeClaimingExcess = (
        await this.seniorTokenContract.balanceOf(this.accounts[5])
      )
        .div(stre18)
        .toNumber();
      await this.vault.connect(this.signers[5]).claim(this.vaultId, 0);
      tokenBalanceAfterClaimingExcess = await this.seniorTokenContract.balanceOf(
        this.accounts[5]
      );
      trancheBalanceAfterClaimingExcess = await srTrancheTokenContract.balanceOf(
        this.accounts[5]
      );
      expect(tokenBalanceAfterClaimingExcess).eq(signer5Excess);
      expect(trancheBalanceAfterClaimingExcess).eq(signer5Invested);
    } else {
      logger.warn(
        "No excess amounts found for signer 5 and signer 2. It is unusual to have the last signer investing in both senior and junior having exact amount required."
      );
    }
    expect(trancheBalanceBeforeClaimingExcess).eq(0);
    expect(tokenBalanceBeforeClaimingExcess).eq(0);
  });

  it("should allow investors to claim junior tranche tokens and excess", async function () {
    let signer2Excess: Decimal =
      (
        await this.vault.connect(this.signers[2]).vaultInvestor(this.vaultId, 1)
      )[2]
        .div(stre18)
        .toNumber() === 0
        ? (
            await this.vault
              .connect(this.signers[2])
              .vaultInvestor(this.vaultId, 1)
          )[2]
        : (
            await this.vault
              .connect(this.signers[2])
              .vaultInvestor(this.vaultId, 0)
          )[2];
    let signer2Invested: Decimal = (
      await this.vault.connect(this.signers[2]).vaultInvestor(this.vaultId, 1)
    )[0];

    let trancheBalanceBeforeClaimingExcess;
    let trancheBalanceAfterClaimingExcess;
    let tokenBalanceBeforeClaimingExcess;
    let tokenBalanceAfterClaimingExcess;
    if (signer2Excess.gt(0) || signer2Invested.gt(0)) {
      trancheBalanceBeforeClaimingExcess = (
        await jrTrancheTokenContract.balanceOf(this.accounts[2])
      )
        .div(stre18)
        .toNumber();
      tokenBalanceBeforeClaimingExcess = (
        await this.juniorTokenContract.balanceOf(this.accounts[2])
      )
        .div(stre18)
        .toNumber();
      await this.vault.connect(this.signers[2]).claim(this.vaultId, 1);
      tokenBalanceAfterClaimingExcess = await this.juniorTokenContract.balanceOf(
        this.accounts[2]
      );
      trancheBalanceAfterClaimingExcess = await jrTrancheTokenContract.balanceOf(
        this.accounts[2]
      );
      expect(trancheBalanceAfterClaimingExcess).eq(signer2Invested);
      expect(tokenBalanceAfterClaimingExcess).eq(signer2Excess);
    } else {
      logger.warn(
        "No excess amounts found for signer 5 and signer 2. It is unusual to have the last signer investing in both senior and junior having exact amount required."
      );
    }
    expect(trancheBalanceBeforeClaimingExcess).eq(0);
    expect(tokenBalanceBeforeClaimingExcess).eq(0);
  });

  it("should allow investors to trade tranche tokens", async function () {
    await this.vault.connect(this.signers[0]).claim(this.vaultId, 1); //claim all the junior tranche assets invested
    await this.vault.connect(this.signers[3]).claim(this.vaultId, 0);
    await srTrancheTokenContract
      .connect(this.signers[3])
      .transfer(
        this.accounts[0],
        await srTrancheTokenContract.balanceOf(this.accounts[3])
      );
    expect(
      (await jrTrancheTokenContract.balanceOf(this.accounts[0]))
        .div(stre18)
        .toNumber()
    ).eq(this.juniorInvestmentPerInvestor);
    expect(
      (await srTrancheTokenContract.balanceOf(this.accounts[0]))
        .div(stre18)
        .toNumber()
    ).eq(this.seniorInvestmentPerInvestor);
  });

  it("should allow investors to withdraw LP tokens", async function () {
    let lpBalanceBeforeWithdraw = await this.poolContract.balanceOf(
      this.accounts[0]
    );
    let jrTrancheBalanceBeforeWithdrawLP = (
      await jrTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let srTrancheBalanceBeforeWithdrawLP = (
      await srTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    const poolData = await this.strategy.pools(this.slp);
    await this.vault.connect(this.signers[0]).withdrawLp(this.vaultId, stre);
    let lpBalanceAfterWithdraw = (
      await this.poolContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let jrTrancheBalanceAfterWithdrawLP = (
      await jrTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let srTrancheBalanceAfterWithdrawLP = (
      await srTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    expect(lpBalanceBeforeWithdraw).eq(0);
    expect(lpBalanceAfterWithdraw).eq(lpTokenCount);
    expect(jrTrancheBalanceBeforeWithdrawLP).gt(
      jrTrancheBalanceAfterWithdrawLP
    );
    expect(srTrancheBalanceBeforeWithdrawLP).gt(
      srTrancheBalanceAfterWithdrawLP
    );
    logger.debug(
      `To withdraw ${lpTokenCount} LP ${
        jrTrancheBalanceBeforeWithdrawLP - jrTrancheBalanceAfterWithdrawLP
      } ${await this.juniorTokenContract.symbol()} and ${
        srTrancheBalanceBeforeWithdrawLP - srTrancheBalanceAfterWithdrawLP
      } ${await this.juniorTokenContract.symbol()} are spent from corresponding tranche tokens. Assertion with precision can be achieved here. TBD`
    );
  });
  it("should allow investors to deposit LP in the Live vault and get back tranche tokens", async function () {
    let jrTrancheBalanceBeforeDepositLP = (
      await jrTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let srTrancheBalanceBeforeDepositLP = (
      await srTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let lpBalanceBeforeDeposit = (
      await this.poolContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let lpTokensToDeposit = ethers.BigNumber.from(10).pow(18).mul(lpTokenCount);
    await this.poolContract.approve(this.vault.address, lpTokensToDeposit); //approve allPairVault to transfer tokens
    await this.vault
      .connect(this.signers[0])
      .depositLp(this.vaultId, lpTokensToDeposit);
    let jrTrancheBalanceAfterDepositLP = (
      await jrTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let srTrancheBalanceAfterDepositLP = (
      await srTrancheTokenContract.balanceOf(this.accounts[0])
    )
      .div(stre18)
      .toNumber();
    let lpBalanceAfterDeposit = await this.poolContract.balanceOf(
      this.accounts[0]
    );
    expect(jrTrancheBalanceAfterDepositLP).eq(this.juniorInvestmentPerInvestor); //deposited back the LP to get all tranche tokens back i.e., entire investement is back
    expect(srTrancheBalanceAfterDepositLP).eq(this.seniorInvestmentPerInvestor); //deposited back the LP to get all tranche tokens back i.e., entire investement is back
    expect(lpBalanceAfterDeposit).eq(0);
  });
  it("should allow harvest and redeem if all LP is withdrawn", async function () {});
  it("should not allow investors to deposit LP when vault is not Live", async function () {});
  it("should allow investors to deposit ETH into Active vault only if the tranch is WETH", async function () {});
  it("should allow investors to withdraw ETH even though the balance in strategy is WETH", async function () {
    //if investor needs to withdraw in ETH he has to do second transaction?
  });
  it("should allow investors to withdraw LP in the correct ratio by depositing tranche tokens. Only correct ratio of tranche tokens burnt and remaining left in the contract", async function () {});
  it("should allow governace to set performanceFee collector for vault", async function () {
    //CREATOR_ROLE should be allowed to set performance fee collector shouldnt it?
  });

  it("should allow redeem and burn tranche tokens", async function () {
    let vaultToBeRedeemedAt =
      this.vaultParams.startTime +
      this.vaultParams.enrollment +
      this.vaultParams.duration;
    await this.provider.send("evm_mine", [vaultToBeRedeemedAt + 10000]);
    await this.vault.redeem(this.vaultId, 0, 0);

    for (let i = 0; i < 6; i++) {
      let seniorTokenBalanceBeforeWithdrawing;
      const seniorTrancheTokenBalance = await srTrancheTokenContract.balanceOf(
        this.accounts[i]
      );
      const seniorWithdrawable: Decimal = (
        await this.vault.connect(this.signers[i]).vaultInvestor(this.vaultId, 0)
      )[3];
      logger.debug(
        `Signer${i} has ${seniorTrancheTokenBalance
          .div(stre18)
          .toString()} senior tranche tokens`
      );
      logger.debug(
        `Signer${i} withdraw ${seniorWithdrawable
          .div(stre18)
          .toString()} senior asset`
      );
      if (seniorTrancheTokenBalance.gt(0)) {
        // if you got some tranche tokens, obviously you should have something to withdraw
        expect(seniorWithdrawable).to.be.gt(0);
      }
      if ((await this.seniorTokenContract.address) === mainnet.assets.weth) {
        seniorTokenBalanceBeforeWithdrawing = await this.signers[
          i
        ].getBalance();
        const txn = await this.vault
          .connect(this.signers[i])
          .withdrawETH(this.vaultId, 0);
        const receipt = await txn.wait();
        // consider transaction fee
        expect(await this.signers[i].getBalance()).to.be.gte(
          seniorTokenBalanceBeforeWithdrawing
            .add(seniorWithdrawable)
            .sub(receipt.gasUsed.mul(txn.gasPrice ?? BigNumber.from(0)))
        );
      } else {
        seniorTokenBalanceBeforeWithdrawing = await this.seniorTokenContract.balanceOf(
          this.accounts[i]
        );
        await this.vault.connect(this.signers[i]).withdraw(this.vaultId, 0);
        expect(
          await this.seniorTokenContract.balanceOf(this.accounts[i])
        ).to.be.gte(
          seniorTokenBalanceBeforeWithdrawing.add(seniorWithdrawable)
        );
      }
      // once withdrawn, you should have no one of tranche tokens
      expect(
        await srTrancheTokenContract.balanceOf(this.accounts[i])
      ).to.be.equal(0);

      let juniorTokenBalanceBeforeWithdrawing;
      const juniorTrancheTokenBalance = await jrTrancheTokenContract.balanceOf(
        this.accounts[i]
      );
      const juniorWithdrawable: Decimal = (
        await this.vault.connect(this.signers[i]).vaultInvestor(this.vaultId, 1)
      )[3];
      logger.debug(
        `Signer${i}  has ${juniorTrancheTokenBalance
          .div(stre18)
          .toString()} junior tranche tokens`
      );
      logger.debug(
        `Signer${i} withdraw ${juniorWithdrawable
          .div(stre18)
          .toString()} junior asset`
      );
      if (juniorTrancheTokenBalance.gt(0)) {
        // if you got some tranche tokens, obviously you should have something to withdraw
        if (this.juniorsLoseAll) {
          expect(juniorWithdrawable).to.be.eq(0);
        } else {
          expect(juniorWithdrawable).to.be.gt(0);
        }
      }
      if ((await this.juniorTokenContract.address) === mainnet.assets.weth) {
        juniorTokenBalanceBeforeWithdrawing = await this.signers[
          i
        ].getBalance();
        const txn = await this.vault
          .connect(this.signers[i])
          .withdrawETH(this.vaultId, 1);
        const receipt = await txn.wait();
        // consider transaction fee
        expect(await this.signers[i].getBalance()).to.be.gte(
          juniorTokenBalanceBeforeWithdrawing
            .add(juniorWithdrawable)
            .sub(receipt.gasUsed.mul(txn.gasPrice ?? BigNumber.from(0)))
        );
      } else {
        juniorTokenBalanceBeforeWithdrawing = await this.juniorTokenContract.balanceOf(
          this.accounts[i]
        );
        await this.vault.connect(this.signers[i]).withdraw(this.vaultId, 1);
        expect(
          await this.juniorTokenContract.balanceOf(this.accounts[i])
        ).to.be.gte(
          juniorTokenBalanceBeforeWithdrawing.add(juniorWithdrawable)
        );
      }
      // once withdrawn, you should have no one of tranche tokens
      expect(
        await jrTrancheTokenContract.balanceOf(this.accounts[i])
      ).to.be.equal(0);
    }
  });
}
