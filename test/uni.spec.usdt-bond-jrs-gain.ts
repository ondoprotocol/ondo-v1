import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers } from "hardhat";
import { mainnet } from "../scripts/utils/addresses";
import { allocateFunds, setupContracts } from "./utils/gen-utils";
import * as logger from "./utils/logger";
import { shouldBehaveLikeVault } from "./behaviour/uniswap/vaultLifecycle";
import { shouldValidateUniStrategyDeployment } from "./behaviour/uniswap/uniStrategySetup";
import { shouldBehaveLikeVaultDuringUniv2Investments } from "./behaviour/uniswap/invest";
use(solidity);

describe("BondStrategy - USDC-BOND helper", async function () {
  let signers: SignerWithAddress[];
  before(async function () {
    this.provider = ethers.provider;
    //*********************setup tranche assets*********************
    this.juniorAsset = mainnet.bond.token;
    this.seniorAsset = mainnet.assets.usdc;

    //*************setup signers. Each signer starts with 10000 ETH**************
    signers = await ethers.getSigners();
    this.accounts = signers.map((s) => s.address);
    this.signers = signers;

    /*************************setup SLOP*/
    this.slp = mainnet.uniswap.pools.usdc_bond;

    //*****************set up contracts********************
    await deployments.fixture("UniswapStrategy");
    this.router = mainnet.uniswap.router;
    let setupContractsBound = setupContracts.bind(this);
    await setupContractsBound();
    logger.debug("contracts setup");
    this.strategy = await ethers.getContract("UniswapStrategy");
    //this.rewardHandlerContract = await ethers.getContract("AlchemixUserReward"); //setup reward handler
    //***************set up USDC-BOND vault details****************
    let startTime = (await this.provider.getBlock("latest")).timestamp + 60;
    //let startTime = 1635552000;
    this.vaultParams = {
      hurdleRate: 10000, ////10000+(percentage*100) i.e., this is 0%
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
    this.juniorInvestmentPerInvestor = 1000;
    this.seniorInvestmentPerInvestor = 40000;
    this.ethInvestmentPerInvestor = 30;
    //**********************************allocate USDT and BOND to first 6 signers so that they can deposit in the vault***************************
    this.tokenContract = this.seniorTokenContract; //contract of the token to be bought
    this.buyTokenWithEthPath = [mainnet.assets.weth, this.seniorAsset];
    this.numberOfTokensToBeBoughtWithEth = 1000000; //number of USDT tokens to be bought
    this.maxEthToBeUsed = 400; //max eth amount to be used to buy those tokens

    /*******************use USDT acquired above to buy BOND******************/
    this.buyTokenWithTokenPath = [this.seniorAsset, this.juniorAsset]; // [USDT, BOND] i.e.,buy DAI with WSTETH
    this.numberOfTokensToBeBoughtWithToken = 1000;
    this.maxTokensToBeSold = 60000;
    this.sellTokenContract = this.seniorTokenContract; //sell USDT
    this.buyTokenContract = this.juniorTokenContract; //buy BOND
    let allocateFundsBound = allocateFunds.bind(this);
    await allocateFundsBound();
    logger.debug("Fund allocation complete");

    /**********special conditions************* */
    this.rewardTokensEmittedOnEmergencyWithdraw = true;
    this.juniorsLoseAll = false;
    this.juniorLoses = false; //with current timestamp junior loses in this vault
    this.midtermDepositsEnabled = false;

    /************do back and forth trades to get some transaction fee */
    this.tradesCount = 30; //number of trades
    this.srToTrade = 31000; //sell these senior tokens to buy juniors in uniswap
    this.jrToTrade = 1000; // sell these many juniors to get senior tokens
    this.srToTradeDelta = 2000; // slight difference in seniors when selling juniors to account for IL

    /***********new paths */
    this.newPathJrToSr = [
      mainnet.bond.token,
      mainnet.assets.weth,
      mainnet.assets.usdc,
    ];
    this.newPathSrToJr = [
      mainnet.assets.usdc,
      mainnet.assets.weth,
      mainnet.bond.token,
    ];

    /**LP tokens to withdraw */
    this.lpTokenCount = 1;
  });

  shouldBehaveLikeVault(
    "USDC-BOND",
    shouldValidateUniStrategyDeployment,
    shouldBehaveLikeVaultDuringUniv2Investments
  );
});
