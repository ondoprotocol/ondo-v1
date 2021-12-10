import { expect } from "chai";
import { createVault } from "../../scripts/utils/helpers";
import { ethers, deployments } from "hardhat";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";
import * as logger from "../utils/logger";
import { SushiStakingV2Strategy__factory } from "../../typechain";
import { mainnet } from "../../scripts/utils/addresses";
import main from "../../scripts/local/dao-deploy";

let harvestAt: number;
let investAt: number;
let createAt: number;
let vaultId: BigNumber;
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);

//this file should eventually test all the core features of the vault
export function shouldBehaveLikeVaultDuringInvestments(vaultCounter: number) {
  before("Setup", async function () {
    await this.allocateFundsBound();
    logger.debug("Fund allocation complete");
    this.vaultParams.startTime =
      (await this.provider.getBlock("latest")).timestamp + 60;
    this.vaultParams = {
      ...this.vaultParams,
      strategy: this.strategy.address,
      strategist: this.accounts[0],
      seniorAsset: this.seniorAsset,
      juniorAsset: this.juniorAsset,
      seniorName: await this.seniorTokenContract.name(),
      seniorSym: await this.seniorTokenContract.symbol(),
      juniorName: await this.juniorTokenContract.name(),
      juniorSym: await this.juniorTokenContract.symbol(),
    };
  });
  it("should allow registry strategist to create pool in the strategy", async function () {
    //the registry strategist is assigned during deployment and assigned to signer[0]
    const poolData = await this.strategy.pools(this.slp);
    if (!poolData._isSet) {
      await this.strategy.addPool(
        this.slp,
        this.poolId,
        [this.nonRewardTokenPath, this.rewardTokenPath],
        this.rewardHandler.address
      );
    }
  });
  it("should allow Creator to create vault", async function () {
    ({ investAt, id: vaultId } = await createVault(
      this.vault,
      this.vaultParams,
      this.signers[0]
    ));
    this.investAt = investAt;
    this.vaultId = vaultId;
    this.vaults.push(vaultId);
    await provider.send("evm_mine", [this.vaultParams.startTime]);
  });
  it("should allow investors to deposit assets in the junior tranche when with in the user and tranche cap", async function () {
    logger.debug(
      `Deposit Block time: ${new Date(
        (await provider.getBlock("latest")).timestamp * 1000
      ).toISOString()}`
    );
    //signers 0,1,2 investing in junior tranche
    for (let i = 0; i < 3; i++) {
      if ((await this.juniorTokenContract.address) === mainnet.assets.weth) {
        await this.vault
          .connect(this.signers[i])
          .depositETH(this.vaults[vaultCounter], 1, {
            value: ethers.utils.parseEther(
              this.ethInvestmentPerInvestor.toString()
            ),
          });
        logger.debug(
          `Depositing ${
            this.ethInvestmentPerInvestor
          } ${await this.juniorTokenContract.symbol()} for signer ${i} using depositETH function`
        );
      } else {
        const juniorTokenBalance = await this.juniorTokenContract.balanceOf(
          this.accounts[i]
        );
        await this.juniorTokenContract
          .connect(this.signers[i])
          .approve(this.vault.address, juniorTokenBalance);
        logger.debug(
          `Depositing ${ethers.BigNumber.from(juniorTokenBalance).div(
            stre18
          )} ${await this.juniorTokenContract.symbol()} for signer ${i}`
        );
        await this.vault
          .connect(this.signers[i])
          .deposit(this.vaults[vaultCounter], 1, juniorTokenBalance);
      }
    }
  });
  it("should allow investors to deposit assets in the senior tranche when with in the user and tranche cap", async function () {
    //signers 3,4,5 investing in senior tranche
    for (let i = 3; i < 6; i++) {
      if ((await this.seniorTokenContract.address) === mainnet.assets.weth) {
        await this.vault
          .connect(this.signers[i])
          .depositETH(this.vaults[vaultCounter], 0, {
            value: ethers.utils.parseEther(
              this.ethInvestmentPerInvestor.toString()
            ),
          });
        logger.debug(
          `Depositing ${
            this.ethInvestmentPerInvestor
          } ${await this.seniorTokenContract.symbol()} for signer ${i} using depositETH function`
        );
      } else {
        const seniorTokenBalance = await this.seniorTokenContract.balanceOf(
          this.accounts[i]
        );
        await this.seniorTokenContract
          .connect(this.signers[i])
          .approve(this.vault.address, seniorTokenBalance);
        logger.debug(
          `Depositing ${ethers.BigNumber.from(seniorTokenBalance).div(
            stre18
          )} ${await this.seniorTokenContract.symbol()} for signer ${i}`
        );
        await this.vault
          .connect(this.signers[i])
          .deposit(this.vaults[vaultCounter], 0, seniorTokenBalance);
      }
    }
  });
  it("should allow strategist to invest - On invest one asset should go to 0 in strategist and lp token amount in masterchef to increase", async function () {
    await provider.send("evm_mine", [this.investAt]); //forward the clock to investAt time to prepare for invest
    const { amount: lpInMCV2BeforeInvest } = await this.masterChefV2.userInfo(
      this.poolId,
      this.strategy.address
    );
    let amounts = await this.vault.callStatic.invest(
      this.vaults[vaultCounter],
      0,
      0
    );
    if (this.seniorInvested) {
      this.seniorInvested.push(ethers.BigNumber.from(amounts[0]).div(stre18));
    } else {
      this.seniorInvested = [ethers.BigNumber.from(amounts[0]).div(stre18)];
    }
    if (this.juniorInvested) {
      this.juniorInvested.push(ethers.BigNumber.from(amounts[1]).div(stre18));
    } else {
      this.juniorInvested = [ethers.BigNumber.from(amounts[1]).div(stre18)];
    }
    logger.info(
      `${this.vaultParams.seniorSym} Amount Invested: ${
        this.seniorInvested[vaultCounter]
      }, ${this.vaultParams.juniorSym} Amount Invested: ${
        this.juniorInvested[vaultCounter]
      } at ${new Date(this.investAt * 1000).toISOString()}`
    );
    await this.vault.invest(this.vaults[vaultCounter], 0, 0);
    const { amount: lpInMCV2AfterInvest } = await this.masterChefV2.userInfo(
      this.poolId,
      this.strategy.address
    );
    const jrLeftOverInStrategyAfterInvest: string = (
      await this.juniorTokenContract.balanceOf(this.strategy.address)
    ).toString();
    const srLeftOverInStrategyAfterInvest: string = (
      await this.seniorTokenContract.balanceOf(this.strategy.address)
    ).toString();
    logger.debug(
      `Number of lp tokens in MCV2 after invest: ${ethers.BigNumber.from(
        lpInMCV2AfterInvest
      ).div(stre18)}`
    );
    logger.debug(
      `${await this.juniorTokenContract.symbol()} balance in strategy after invest: ${ethers.BigNumber.from(
        jrLeftOverInStrategyAfterInvest
      ).div(stre18)}`
    );
    logger.debug(
      `${await this.seniorTokenContract.symbol()} balance in strategy after invest: ${ethers.BigNumber.from(
        srLeftOverInStrategyAfterInvest
      ).div(stre18)}`
    );
    expect(lpInMCV2AfterInvest).gt(lpInMCV2BeforeInvest);
    expect(
      jrLeftOverInStrategyAfterInvest === "0" ||
        srLeftOverInStrategyAfterInvest === "0"
    );
  });
}
