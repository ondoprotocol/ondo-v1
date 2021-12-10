import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers } from "hardhat";
import { mainnet } from "../scripts/utils/addresses";
import { allocateFunds, setupContracts } from "./utils/gen-utils";
import * as logger from "./utils/logger";
import { shouldBehaveLikeVault } from "./behaviour/vaultLifecycle";
use(solidity);

describe("SushiStakingV2Strategy - WETH-ALCX helper", async function () {
  let signers: SignerWithAddress[];
  before(async function () {
    this.provider = ethers.provider;
    //*********************setup tranche assets*********************
    this.juniorAsset = mainnet.alchemix.token;
    this.seniorAsset = mainnet.assets.weth;

    //*************setup signers. Each signer starts with 10000 ETH**************
    signers = await ethers.getSigners();
    this.accounts = signers.map((s) => s.address);
    this.signers = signers;

    /*************************setup SLOP*/
    this.slp = mainnet.alchemix.slp;

    //*****************set up contracts********************
    await deployments.fixture("SushiStakingV2Strategy");
    await deployments.fixture("AlchemixUserReward");
    this.router = mainnet.sushi.router;
    let setupContractsBound = setupContracts.bind(this);
    await setupContractsBound();
    this.rewardHandlerContract = await ethers.getContract("AlchemixUserReward"); //setup reward handler
    this.strategy = await ethers.getContract("SushiStakingV2Strategy");
    logger.debug("Contracts setup complete");
    //***************set up WETH-ALCX vault details****************
    let startTime = (await this.provider.getBlock("latest")).timestamp + 60;
    //let startTime = 1635552000;
    this.vaultParams = {
      hurdleRate: 10208, ////10000+(percentage*100) i.e., this is 2.08% i.e., ~25% APY
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
    this.harvestWaitDays = 7; //wait for these many days before next harvest
    this.warnLPHarvestThreshold = 10;

    //********************************set up pool params************************************************
    this.poolId = 0;
    this.rewardHandler = { address: this.rewardHandlerContract.address };
    this.nonRewardTokenPath = [mainnet.sushi.token, this.seniorAsset];
    this.rewardTokenPath = [this.juniorAsset];
    this.rewardTokenContract = this.juniorTokenContract;
    logger.debug("pool setup complete");

    /******************Investments to be made************************ */
    this.juniorInvestmentPerInvestor = 2000;
    this.seniorInvestmentPerInvestor = 500;
    this.ethInvestmentPerInvestor = this.seniorInvestmentPerInvestor;
    //**********************************allocate BIT and Weth to first 6 signers so that they can deposit in the vault***************************
    this.tokenContract = this.juniorTokenContract; //contract of the token to be bought
    this.buyTokenWithEthPath = [this.seniorAsset, this.juniorAsset]; //[ETH, BIT] i.e., buy BIT with ETH
    this.numberOfTokensToBeBoughtWithEth = 2000; //number of BIT tokens to be bought
    this.maxEthToBeUsed = 300; //max eth amount to be used to buy those tokens
    let allocateFundsBound = allocateFunds.bind(this);
    await allocateFundsBound();
    logger.debug("Fund allocation complete");

    /**********special conditions************* */
    this.rewardTokensEmittedOnEmergencyWithdraw = true;
    this.juniorsLoseAll = false;
    this.juniorLoses = true; //with current timestamp junior loses in this vault
  });

  shouldBehaveLikeVault("WETH-ALCX");
});
