import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers } from "hardhat";
import { mainnet } from "../scripts/utils/addresses";
import { allocateFunds, setupContracts } from "./utils/gen-utils";
import * as logger from "./utils/logger";
import { shouldBehaveLikeVault } from "./behaviour/asushiswap/vaultLifecycle";
import { shouldValidateUniStrategyDeployment } from "./behaviour/asushiswap/uniStrategySetup";
import { shouldBehaveLikeVaultDuringUniv2Investments } from "./behaviour/asushiswap/invest";
use(solidity);

describe("EdenStrategy - WETH-EDEN helper", async function () {
  let signers: SignerWithAddress[];
  before(async function () {
    this.provider = ethers.provider;
    //*********************setup tranche assets*********************
    this.juniorAsset = mainnet.eden.token;
    this.seniorAsset = mainnet.assets.weth;

    //*************setup signers. Each signer starts with 10000 ETH**************
    signers = await ethers.getSigners();
    this.accounts = signers.map((s) => s.address);
    this.signers = signers;

    /*************************setup SLP*/
    this.slp = mainnet.sushi.pools.eden_eth;
    this.poolId = 0;

    //*****************set up contracts********************
    this.router = mainnet.sushi.router;
    await deployments.fixture("EdenStrategy");
    let setupContractsBound = setupContracts.bind(this);
    await setupContractsBound();
    logger.debug("contracts setup");
    this.strategy = await ethers.getContract("EdenStrategy");
    this.rewardStakingContract = await ethers.getContractAt(
      "IRewardsManager",
      mainnet.eden.rewardManager
    );
    //***************set up WETH-EDEN vault details****************
    let startTime = (await this.provider.getBlock("latest")).timestamp + 60;
    //let startTime = 1635552000;
    this.vaultParams = {
      hurdleRate: 10000, ////10000+(percentage*100)
      startTime,
      enrollment: 60 * 60 * 24 * 2, // 2 days
      duration: 60 * 60 * 24 * 30, //30 days
      juniorTrancheCap: ethers.BigNumber.from(10).pow(23).mul(15), //max tranche cap 150000
      juniorUserCap: ethers.BigNumber.from(10).pow(23).mul(5), //max user cap 500000
      seniorTrancheCap: ethers.BigNumber.from(10).pow(21).mul(2), //max tranche cap 2000 ETH
      seniorUserCap: ethers.BigNumber.from(10).pow(20).mul(5), //max user cap 400 ETH
    };
    logger.debug("vault setup complete");

    //************setup harvest wait duration****************** */
    this.harvestWaitDays = 14; //wait for these many days before next harvest
    this.warnLPHarvestThreshold = 10;

    /******************Investments to be made************************ */
    this.juniorInvestmentPerInvestor = 60000;
    this.seniorInvestmentPerInvestor = 40000;
    this.ethInvestmentPerInvestor = 100;
    //**********************************allocate EDEN to first 6 signers so that they can deposit in the vault***************************
    this.tokenContract = this.juniorTokenContract; //contract of the token to be bought
    this.buyTokenWithEthPath = [mainnet.assets.weth, this.juniorAsset];
    this.numberOfTokensToBeBoughtWithEth = 60000; //number of EDEN tokens to be bought
    this.maxEthToBeUsed = 400; //max eth amount to be used to buy those tokens
    let allocateFundsBound = allocateFunds.bind(this);
    await allocateFundsBound();
    logger.debug("Fund allocation complete");

    /**********special conditions************* */
    this.rewardTokensEmittedOnEmergencyWithdraw = true;
    this.juniorsLoseAll = false;
    this.juniorLoses = false; //with current timestamp junior loses in this vault
    this.midtermDepositsEnabled = false;

    /**LP tokens to withdraw */
    this.lpTokenCount = 1;
  });

  shouldBehaveLikeVault(
    "WETH-EDEN",
    shouldValidateUniStrategyDeployment,
    shouldBehaveLikeVaultDuringUniv2Investments
  );
});
