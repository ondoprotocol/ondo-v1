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
export function shouldBehaveLikeVaultDuringInvestments() {
  before("Setup", async function () {
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
  it("should not allow zero address for the router while deploying sushi2 strategy", async function () {
    let sushiv2Factory: SushiStakingV2Strategy__factory = new SushiStakingV2Strategy__factory(
      this.signers[0]
    );
    await expect(
      sushiv2Factory.deploy(
        this.registryContract.address,
        ethers.constants.AddressZero,
        this.masterChefV2.address,
        mainnet.sushi.factory,
        mainnet.sushi.token
      )
    ).to.be.revertedWith("Invalid address");
  });
  it("should not allow zero address for the masterchef while deploying sushi2 strategy", async function () {
    let sushiv2Factory: SushiStakingV2Strategy__factory = new SushiStakingV2Strategy__factory(
      this.signers[0]
    );
    await expect(
      sushiv2Factory.deploy(
        this.registryContract.address,
        mainnet.sushi.router,
        ethers.constants.AddressZero,
        mainnet.sushi.factory,
        mainnet.sushi.token
      )
    ).to.be.revertedWith("Invalid address");
  });
  it("should not allow zero address for the factory while deploying sushi2 strategy", async function () {
    let sushiv2Factory: SushiStakingV2Strategy__factory = new SushiStakingV2Strategy__factory(
      this.signers[0]
    );
    await expect(
      sushiv2Factory.deploy(
        this.registryContract.address,
        mainnet.sushi.router,
        this.masterChefV2.address,
        ethers.constants.AddressZero,
        mainnet.sushi.token
      )
    ).to.be.revertedWith("Invalid address");
  });
  it("should not allow zero address for the sushi token while deploying sushi2 strategy", async function () {
    let sushiv2Factory: SushiStakingV2Strategy__factory = new SushiStakingV2Strategy__factory(
      this.signers[0]
    );
    await expect(
      sushiv2Factory.deploy(
        this.registryContract.address,
        mainnet.sushi.router,
        this.masterChefV2.address,
        mainnet.sushi.factory,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWith("Invalid address");
  });
  it("should not allow registry strategist to create pool if pool address is 0", async function () {
    //the registry strategist is assigned during deployment and assigned to signer[0]
    await expect(
      this.strategy.addPool(
        ethers.constants.AddressZero,
        this.poolId,
        [this.nonRewardTokenPath, this.rewardTokenPath],
        this.rewardHandler.address
      )
    ).to.be.revertedWith("Cannot be zero address");
  });
  it("should not allow registry strategist to create pool if pool address is 0", async function () {
    //the registry strategist is assigned during deployment and assigned to signer[0]
    await expect(
      this.strategy.addPool(
        this.slp,
        this.poolId + 1,
        [this.nonRewardTokenPath, this.rewardTokenPath],
        this.rewardHandler.address
      )
    ).to.be.revertedWith("LP Token does not match");
  });
  it("should not allow strategist to create pool if pool address is 0", async function () {
    //the registry strategist is assigned during deployment and assigned to signer[0]
    await expect(
      this.strategy.addPool(
        this.slp,
        this.poolId,
        [this.rewardTokenPath, this.rewardTokenPath],
        this.rewardHandler.address
      )
    ).to.be.revertedWith("First path must be from SUSHI");
  });
  it("should not allow Creator to create vault if pool is not created in strategy", async function () {
    //the creator is assigned during deployment and assigned to signer[0]

    await expect(
      createVault(this.vault, this.vaultParams, this.signers[0])
    ).to.be.revertedWith("Pool not supported");
  });
  it("should NOT allow anyone other than registry strategist to create pool in the strategy", async function () {
    await expect(
      this.strategy
        .connect(this.signers[1])
        .addPool(
          this.slp,
          this.poolId,
          [this.nonRewardTokenPath, this.rewardTokenPath],
          this.rewardHandler.address
        )
    ).to.be.revertedWith("Unauthorized");
  });
  it("should allow registry strategist to create pool in the strategy", async function () {
    //the registry strategist is assigned during deployment and assigned to signer[0]
    await this.strategy.addPool(
      this.slp,
      this.poolId,
      [this.nonRewardTokenPath, this.rewardTokenPath],
      this.rewardHandler.address
    );
  });
  it("should allow Creator to create vault", async function () {
    ({ investAt, id: vaultId } = await createVault(
      this.vault,
      this.vaultParams,
      this.signers[0]
    ));
    this.investAt = investAt;
    this.vaultId = vaultId;
    await provider.send("evm_mine", [this.vaultParams.startTime]);
  });
  it("should NOT allow any one other than creator to create vault", async function () {
    await expect(
      createVault(this.vault, this.vaultParams, this.signers[1])
    ).to.be.revertedWith("Unauthorized");
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
        await this.vault.connect(this.signers[i]).depositETH(this.vaultId, 1, {
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
          .deposit(this.vaultId, 1, juniorTokenBalance);
      }
    }
  });
  it("should allow investors to deposit assets in the senior tranche when with in the user and tranche cap", async function () {
    //signers 3,4,5 investing in senior tranche
    for (let i = 3; i < 6; i++) {
      if ((await this.seniorTokenContract.address) === mainnet.assets.weth) {
        await this.vault.connect(this.signers[i]).depositETH(this.vaultId, 0, {
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
          .deposit(this.vaultId, 0, seniorTokenBalance);
      }
    }
  });
  it("should not allow strategist to invest before the investAt time", async function () {
    await expect(this.vault.invest(this.vaultId, 0, 0)).to.be.revertedWith(
      "Not time yet"
    );
  });
  it("should allow strategist to invest - On invest one asset should go to 0 in strategist and lp token amount in masterchef to increase", async function () {
    await provider.send("evm_mine", [this.investAt]); //forward the clock to investAt time to prepare for invest
    const { amount: lpInMCV2BeforeInvest } = await this.masterChefV2.userInfo(
      this.poolId,
      this.strategy.address
    );
    let amounts = await this.vault.callStatic.invest(this.vaultId, 0, 0);
    this.seniorInvested = ethers.BigNumber.from(amounts[0]).div(stre18);
    this.juniorInvested = ethers.BigNumber.from(amounts[1]).div(stre18);
    logger.info(
      `${this.vaultParams.seniorSym} Amount Invested: ${this.seniorInvested}, ${
        this.vaultParams.juniorSym
      } Amount Invested: ${this.juniorInvested} at ${new Date(
        this.investAt * 1000
      ).toISOString()}`
    );
    await this.vault.invest(this.vaultId, 0, 0);
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
    this.investedVaultSnapshot = await this.provider.send("evm_snapshot");
  });
  it("should not allow investors to deposit assets when exceeds usercap for the tranche", async function () {});
  it("should not allow investors to deposit assets in the live vault", async function () {});
  it("should allow investors to claim uninvested asset plus tranche tokens for the corresponding asset", async function () {});
  it("should not return tranche tokens on claim if enableTokens flag is disabled", async function () {});
  it("should allow investors to deposit ETH into Active vault only if the tranche is WETH", async function () {});
  it("should allow investors to claim ETH though the vault asset is WETH", async function () {});
  it("should allow performance fee to be set and changed by strategist on inactive vaults only", async function () {});
  it("should not allow performance fee to be more than a predetermined amount", async function () {});
  //***************view functions************
  it("should be able to retrieve vault for specific vault index or a range of vault indexes", async function () {});
  it("should be able to retrieve vault for specific trancheToken address", async function () {});
  it("should be able to retrieve expected senior amount for the vault", async function () {});
  it("should be able to retrieve correct usercaps set in the vault", async function () {});
  it("should be able to retrieve all the correct details of vault investor like position, claimable and withdrawable balances, excess", async function () {});
}
