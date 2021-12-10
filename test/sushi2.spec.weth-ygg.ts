import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers } from "hardhat";
import { mainnet } from "../scripts/utils/addresses";
import { allocateFunds, setupContracts } from "./utils/gen-utils";
import * as logger from "./utils/logger";
import { shouldBehaveLikeVault } from "./behaviour/vaultLifecycle";
use(solidity);

describe("SushiStakingV2Strategy - ETH-YGG helper", async function () {
  let signers: SignerWithAddress[];

  before(async function () {
    this.provider = ethers.provider;
    //*********************setup tranche assets*********************
    this.juniorAsset = mainnet.ygg.token;
    this.seniorAsset = mainnet.assets.weth;

    //*************setup signers. Each signer starts with 10000 ETH**************
    signers = await ethers.getSigners();
    this.accounts = signers.map((s) => s.address);
    this.signers = signers;

    /**set up slp */
    this.slp = mainnet.ygg.slp;

    //*****************set up contracts********************
    await deployments.fixture("SushiStakingV2Strategy");
    this.router = mainnet.sushi.router;
    let setupContractsBound = setupContracts.bind(this);
    await setupContractsBound();
    this.strategy = await ethers.getContract("SushiStakingV2Strategy");
    logger.debug("Contracts setup complete");
    //***************set up ETH-YGG vault details****************
    let startTime = (await this.provider.getBlock("latest")).timestamp + 60;
    //let startTime = 1635552000;
    this.vaultParams = {
      hurdleRate: 11000, ////actual percentage time 1000 i.e., this is 11%
      startTime,
      enrollment: 60 * 60 * 24 * 2, // 2 days
      duration: 60 * 60 * 24 * 30, //30 days
      juniorTrancheCap: ethers.BigNumber.from(10).pow(23).mul(3), //max tranche cap 300000
      juniorUserCap: ethers.BigNumber.from(10).pow(23), //max user cap 100000
      seniorTrancheCap: ethers.BigNumber.from(10).pow(21).mul(4), //max tranche cap 4000 ETH
      seniorUserCap: ethers.BigNumber.from(10).pow(20).mul(6), //max user cap 500 ETH
    };
    logger.debug("vault setup complete");

    //************setup harvest wait duration****************** */
    this.harvestWaitDays = 2; //wait for these many days before next harvest
    this.warnLPHarvestThreshold = 10;

    //********************************set up pool params************************************************
    this.poolId = 6;
    this.rewardHandler = { address: ethers.constants.AddressZero };
    this.nonRewardTokenPath = [mainnet.sushi.token, this.seniorAsset];
    this.rewardTokenPath = [this.juniorAsset];
    this.rewardTokenContract = this.juniorTokenContract;
    logger.debug("pool setup complete");

    /******************Investments to be made************************ */
    this.juniorInvestmentPerInvestor = 100000; //each investor trying to invest 100000 YGG into the junior vault. change these for different scenarios
    this.seniorInvestmentPerInvestor = 450; // each investor trying to invest 450 ETH into the Senior vault. change these for different scenarios
    this.ethInvestmentPerInvestor = this.seniorInvestmentPerInvestor;

    //**********************************allocate YGG and Weth to first 6 signers so that they can deposit in the vault***************************
    this.tokenContract = this.juniorTokenContract; //contract of the token to be bought
    this.buyTokenWithEthPath = [this.seniorAsset, this.juniorAsset]; //[ETH, YGG] i.e., buy YGG with ETH
    this.numberOfTokensToBeBoughtWithEth = 100000; //number of YGG tokens to be bought
    this.maxEthToBeUsed = 450; //max eth amount to be used to buy those tokens
    let allocateFundsBound = allocateFunds.bind(this);
    await allocateFundsBound();
    logger.debug("Fund allocation complete");

    /**********special condition issues per vault************* */
    this.rewardTokensEmittedOnEmergencyWithdraw = true;
    this.juniorsLoseAll = false;
    this.juniorLoses = true; //with current timestamp junior loses in this vault
  });

  shouldBehaveLikeVault("WETH-YGG");
});
