import { expect } from "chai";
import { createVault } from "../../../scripts/utils/helpers";
import { deployments, ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";
import logger from "../../utils/logger";
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
        let lpBalanceBeforeRevert = await this.poolContract.balanceOf(
          this.strategy.address
        );
        logger.debug(
          `lpBalanceBeforeRevert: ${lpBalanceBeforeRevert.div(stre18)}`
        );
        let revertStatus = await this.provider.send("evm_revert", [
          this.investedVaultSnapshot,
        ]);
        logger.debug(
          `Revert to ${this.investedVaultSnapshot} status: ${revertStatus}`
        );
        let lpBalanceAfterRevert = await this.poolContract.balanceOf(
          this.strategy.address
        );
        logger.debug(`lpBalanceAfterRevert: ${lpBalanceAfterRevert}`);
        logger.debug(
          `Latest block timestamp after revert: ${new Date(
            (await this.provider.getBlock("latest")).timestamp * 1000
          ).toISOString()}`
        );
        this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
      }
    }
  );
  it("should allow governace to withdraw LP from uniswap to strategy", async function () {
    let vaultInvestedAt =
      this.vaultParams.startTime + this.vaultParams.enrollment;
    const lpBalanceBeforeRemoveLiquidity = await this.poolContract.balanceOf(
      this.strategy.address
    );
    const srBalanceBeforeRemoveLiquidity = await this.seniorTokenContract.balanceOf(
      this.strategy.address
    );
    const jrBalanceBeforeRemoveLiquidity = await this.juniorTokenContract.balanceOf(
      this.strategy.address
    );
    const encodedFunctionApproveLP = this.poolContract.interface.encodeFunctionData(
      "approve",
      [this.routerContract.address, lpBalanceBeforeRemoveLiquidity]
    );
    await this.strategy.multiexcall([
      { target: this.poolContract.address, data: encodedFunctionApproveLP },
    ]);
    logger.debug(
      `Approved ${this.routerContract.address} to spend ${lpBalanceBeforeRemoveLiquidity} LP tokens`
    );
    await provider.send("evm_mine", [vaultInvestedAt + 1000]);
    const encodedFunctionRemoveLiquidity = this.routerContract.interface.encodeFunctionData(
      "removeLiquidity",
      [
        this.seniorAsset,
        this.juniorAsset,
        lpBalanceBeforeRemoveLiquidity,
        0,
        0,
        this.strategy.address,
        (await provider.getBlock("latest")).timestamp + 2000,
      ]
    );
    await this.strategy.connect(this.signers[0]).multiexcall([
      {
        target: this.routerContract.address,
        data: encodedFunctionRemoveLiquidity,
      },
    ]);
    const lpBalanceAfterRemoveLiquidity = await this.poolContract.balanceOf(
      this.strategy.address
    );
    const srBalanceAfterRemoveLiquidity = await this.seniorTokenContract.balanceOf(
      this.strategy.address
    );
    const jrBalanceaAfterRemoveLiquidity = await this.juniorTokenContract.balanceOf(
      this.strategy.address
    );
    expect(lpBalanceAfterRemoveLiquidity).eq(0);
    expect(srBalanceAfterRemoveLiquidity).gt(srBalanceBeforeRemoveLiquidity);
    expect(jrBalanceaAfterRemoveLiquidity).gt(jrBalanceBeforeRemoveLiquidity);
  });
  it("should not allow any one other than governace to call multiexcall", async function () {
    const encodedFunctionApproveLP = this.poolContract.interface.encodeFunctionData(
      "approve",
      [this.routerContract.address, 0]
    );
    await expect(
      this.strategy
        .connect(this.signers[1])
        .multiexcall([
          { target: this.poolContract.address, data: encodedFunctionApproveLP },
        ])
    ).to.be.revertedWith("Unauthorized");
  });
  it("should return error if multicall fails", async function () {
    const lpBalanceBeforeRemoveLiquidity = (
      await this.poolContract.balanceOf(this.strategy.address)
    ).add("100");
    const encodedFunctionApproveLP = this.poolContract.interface.encodeFunctionData(
      "transfer",
      [this.routerContract.address, lpBalanceBeforeRemoveLiquidity]
    );
    await expect(
      this.strategy
        .connect(this.signers[0])
        .multiexcall([
          { target: this.poolContract.address, data: encodedFunctionApproveLP },
        ])
    ).to.be.revertedWith("Multicall aggregate: call failed");
  });
  it("should allow guardian role to rescue the tokens from strategy", async function () {
    const jrTokensInStrategyBeforeRescue: string = (
      await this.juniorTokenContract.balanceOf(this.strategy.address)
    ).toString();
    await this.strategy.pause();
    await this.strategy.rescueTokens([this.juniorTokenContract.address], [0]);
    const jrTokensInAddressAfterRescue: string = (
      await this.juniorTokenContract.balanceOf(this.signers[0].address)
    ).toString();
    expect(jrTokensInStrategyBeforeRescue).eq(jrTokensInAddressAfterRescue);
  });
  it("should not allow anyone other than guardian role to rescue the LP tokens withdrawn from mcv2", async function () {
    await expect(
      this.strategy
        .connect(this.signers[1])
        .rescueTokens([this.poolContract.address], [0])
    ).to.be.revertedWith("Unauthorized");
  });
}
