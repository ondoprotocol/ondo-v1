import { deployments, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import Decimal from "decimal.js";
import { ERC20, IUniswapV2Router02, AllPairVault } from "../../typechain";
import { mainnet } from "../../scripts/utils/addresses";
import logger from "./logger";

let router: IUniswapV2Router02;
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);

export async function buyTokensWithEth(
  signer: SignerWithAddress,
  account: string,
  pathToBuyTokens: string[],
  numberOfTokensToBeBought: number,
  maxEthAmountToBeUsed: number,
  tokenContract: ERC20,
  signerNumber: number,
  routerContract: IUniswapV2Router02
) {
  const numberOfTokens = new Decimal(10)
    .pow(await tokenContract.decimals())
    .mul(numberOfTokensToBeBought); //find the actual number of tokens including decimals
  const strNumberOfTokens = numberOfTokens.toFixed(0);
  const maxEthAmount = new Decimal(10).pow(18).mul(maxEthAmountToBeUsed); //decimals of WETH is 18
  const strMaxEthAmount = maxEthAmount.toFixed(0);
  logger.debug(
    `About to buy ${numberOfTokensToBeBought}  ${await tokenContract.symbol()} tokens using ${maxEthAmountToBeUsed} weth for signer ${signerNumber} with path ${pathToBuyTokens}`
  );
  let response = await routerContract
    .connect(signer)
    .swapETHForExactTokens(
      strNumberOfTokens,
      pathToBuyTokens,
      account,
      (await provider.getBlock("latest")).timestamp + 2000,
      {
        value: strMaxEthAmount,
      }
    );
  logger.debug(
    `Bought ${ethers.BigNumber.from(await tokenContract.balanceOf(account))
      .div(new Decimal(10).pow(await tokenContract.decimals()).toString())
      .toString()}  ${await tokenContract.symbol()} tokens using ${ethers.BigNumber.from(
      10000
    ).sub(
      ethers.BigNumber.from(
        (await ethers.provider.getBalance(account)).div(stre18)
      ).toString()
    )} weth for signer ${signerNumber}`
  );
}

export async function buyTokensWithTokens(
  signer: SignerWithAddress,
  account: string,
  pathToBuyTokens: string[],
  numberOfTokensToBeBought: number,
  maxTokensToBeSold: number,
  signerNumber: number,
  routerContract: IUniswapV2Router02,
  sellTokenContract: ERC20,
  buyTokenContract: ERC20,
  hideLogs: boolean
) {
  const sellTokenBalanceBeforeTx = ethers.BigNumber.from(
    await sellTokenContract.balanceOf(account)
  )
    .div(new Decimal(10).pow(await sellTokenContract.decimals()).toString())
    .toString();
  const buyTokenBalanceBeforeTx = ethers.BigNumber.from(
    await buyTokenContract.balanceOf(account)
  )
    .div(new Decimal(10).pow(await buyTokenContract.decimals()).toString())
    .toString();
  const actualNumberOfTokensToBeBought = new Decimal(10)
    .pow(await buyTokenContract.decimals())
    .mul(numberOfTokensToBeBought); //find the actual number of tokens including decimals
  const actualMaxTokensToBeSold = new Decimal(10)
    .pow(await sellTokenContract.decimals())
    .mul(maxTokensToBeSold);
  await sellTokenContract
    .connect(signer)
    .approve(routerContract.address, actualMaxTokensToBeSold.toFixed(0));
  if (!hideLogs) {
    logger.debug(
      (
        await sellTokenContract
          .connect(signer)
          .allowance(signer.address, routerContract.address)
      ).toString()
    );
    logger.debug(
      `About to buy ${numberOfTokensToBeBought} ${await buyTokenContract.symbol()} by selling ${maxTokensToBeSold} ${await sellTokenContract.symbol()} using path ${pathToBuyTokens}`
    );
  }
  let response = await routerContract
    .connect(signer)
    .swapTokensForExactTokens(
      actualNumberOfTokensToBeBought.toFixed(0),
      actualMaxTokensToBeSold.toFixed(0),
      pathToBuyTokens,
      account,
      (await provider.getBlock("latest")).timestamp + 2000
    );
  const buyTokenBalanceAfterTx = ethers.BigNumber.from(
    await buyTokenContract.balanceOf(account)
  )
    .div(new Decimal(10).pow(await buyTokenContract.decimals()).toString())
    .toString();
  const sellTokenBalanceAfterTx = ethers.BigNumber.from(
    await sellTokenContract.balanceOf(account)
  )
    .div(new Decimal(10).pow(await sellTokenContract.decimals()).toString())
    .toString();
  if (!hideLogs) {
    logger.debug(
      `Bought ${ethers.BigNumber.from(buyTokenBalanceAfterTx)
        .sub(buyTokenBalanceBeforeTx)
        .toString()}  ${await buyTokenContract.symbol()} tokens using ${ethers.BigNumber.from(
        sellTokenBalanceBeforeTx
      ).sub(
        sellTokenBalanceAfterTx
      )} ${await sellTokenContract.symbol()} for signer ${signerNumber}`
    );
  }
}

export async function swapEthtoWeth(
  signer: SignerWithAddress,
  signerNumber: number,
  ethAmount: number
) {
  let wethContract: ERC20 = await ethers.getContractAt(
    "ERC20",
    mainnet.assets.weth
  );
  await signer.sendTransaction({
    to: mainnet.assets.weth,
    value: ethers.utils.parseEther(ethAmount.toString()),
  });
  let weiReceivedInWeth: string = (
    await wethContract.balanceOf(signer.address)
  ).toString();
  logger.debug(
    `Converted ${ethAmount} ethers to ${ethers.BigNumber.from(
      weiReceivedInWeth
    ).div(stre18)} weth for signer ${signerNumber}`
  );
}
export async function computeHarvestAt(
  investAt: number,
  harvestAt: number,
  days: number
): Promise<number> {
  //for the test harvest being run alternate day, we should add 2 days for incoming harvestAt time
  let harvestAtComputed: number = harvestAt || investAt;
  harvestAtComputed = harvestAtComputed + 60 * 60 * 24 * days;
  return harvestAtComputed;
}

export async function allocateFunds() {
  for (let i = 0; i < 6; i++) {
    //buy tokens required using Eth
    await buyTokensWithEth(
      this.signers[i],
      this.accounts[i],
      this.buyTokenWithEthPath,
      this.numberOfTokensToBeBoughtWithEth,
      this.maxEthToBeUsed,
      this.tokenContract,
      i,
      this.routerContract
    );
    if (this.buyTokenWithTokenPath) {
      //if there is not Eth in either of the tranches, then buy the tranche tokens required using the other tranche tokens acquired above
      await buyTokensWithTokens(
        this.signers[i],
        this.accounts[i],
        this.buyTokenWithTokenPath,
        this.numberOfTokensToBeBoughtWithToken,
        this.maxTokensToBeSold,
        i,
        this.routerContract,
        this.sellTokenContract,
        this.buyTokenContract,
        false
      );
    }
  }
}

export async function setupContracts() {
  this.seniorTokenContract = await ethers.getContractAt(
    "ERC20",
    this.seniorAsset
  );
  this.juniorTokenContract = await ethers.getContractAt(
    "ERC20",
    this.juniorAsset
  );
  this.jrDecimalsFactor = ethers.BigNumber.from(10).pow(
    await this.juniorTokenContract.decimals()
  );
  this.srDecimalsFactor = ethers.BigNumber.from(10).pow(
    await this.seniorTokenContract.decimals()
  );
  this.poolContract = await ethers.getContractAt("ERC20", this.slp);
  this.sushiContract = await ethers.getContractAt("ERC20", mainnet.sushi.token);
  this.rewarderContract = await ethers.getContractAt(
    "MockRewarder",
    mainnet.cvx.rewards
  );
  this.routerContract = await ethers.getContractAt(
    "IUniswapV2Router02",
    this.router
  );
  this.registryContract = await ethers.getContract("Registry");
  this.trancheTokenContract = await ethers.getContract("TrancheToken");
  this.vault = await ethers.getContract("AllPairVault");
  this.masterChefV2 = await ethers.getContractAt(
    "IMasterChefV2",
    mainnet.sushi.chef2
  );
}
