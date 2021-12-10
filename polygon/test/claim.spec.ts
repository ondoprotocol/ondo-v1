import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { Addresses } from "./utils/addresses";
import { createVault, getAddresses, getStrategyName } from "./utils/helpers";
import {
  AllPairVault,
  IERC20,
  IUniswapV2Router02,
  Registry,
  UniswapStrategy,
} from "../../typechain";

describe("Claim", async function () {
  let allPair: AllPairVault;
  let strategy: UniswapStrategy;
  let id: BigNumber;
  let e18 = ethers.BigNumber.from(10).pow(18);
  let signers: SignerWithAddress[];
  let dai: IERC20;
  let investAt: number;
  let harvestAt: number;
  let redeemAt: number;
  let addresses: Addresses;
  let strategyName: string;

  addresses = getAddresses();
  strategyName = getStrategyName();

  async function now(): Promise<number> {
    let t = (await ethers.provider.getBlock("latest")).timestamp;
    return t;
  }
  const enrollment = 60 * 60 * 24 * 7;
  const duration = 60 * 60 * 24 * 14;
  const hurdle = 11000;

  before(async function () {
    await deployments.fixture([strategyName]);
    let reg: Registry = await ethers.getContract("Registry");
    await reg.enableTokens();
    allPair = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract(strategyName);
    signers = await ethers.getSigners();

    dai = await ethers.getContractAt("IERC20", addresses.assets.dai);
  });
  it("Create vault", async function () {
    const startTime = (await now()) + 30;
    const params = {
      strategy: strategy.address,
      strategist: signers[0].address,
      seniorAsset: addresses.assets.weth,
      juniorAsset: addresses.assets.dai,
      hurdleRate: hurdle,
      startTime: startTime,
      enrollment: enrollment,
      duration: duration,
    };
    ({ investAt, harvestAt, redeemAt, id } = await createVault(
      allPair,
      params
    ));
    await strategy.setPathJuniorToSenior([
      params.juniorAsset,
      params.seniorAsset,
    ]);
    await strategy.setPathSeniorToJunior([
      params.seniorAsset,
      params.juniorAsset,
    ]);
  });
  it("Get some DAI", async function () {
    let uniRouter: IUniswapV2Router02 = await ethers.getContractAt(
      "IUniswapV2Router02",
      addresses.uniswap.router
    );
    uniRouter.swapExactETHForTokens(
      e18,
      [addresses.assets.weth, addresses.assets.dai],
      signers[0].address,
      (await now()) + 500,
      { value: e18 }
    );
  });
  it("Deposit on both sides", async function () {
    let daiAmount = await dai.balanceOf(signers[0].address);
    let start = investAt;
    ethers.provider.send("evm_mine", [start]);
    await allPair.depositETH(id, 0, { value: e18.div(2) });
    await dai.approve(allPair.address, daiAmount);
    expect(await dai.balanceOf(signers[0].address)).gt(0);
    await allPair.deposit(id, 1, daiAmount);
    expect(await dai.balanceOf(signers[0].address)).eq(0);
  });
  it("Move to invest state", async function () {
    ethers.provider.send("evm_mine", [investAt + 10]);
    await allPair.invest(id, 0, 0);
  });
  it("Try to claim DAI", async function () {
    let dai1 = await dai.balanceOf(signers[0].address);
    await allPair.claim(id, 1);
    let dai2 = await dai.balanceOf(signers[0].address);
  });
  it("Try to claim ETH", async function () {
    let eth1 = await ethers.provider.getBalance(signers[0].address);
    await allPair.claimETH(id, 0);
    let eth2 = await ethers.provider.getBalance(signers[0].address);
  });
  it("Redeem funds", async function () {
    ethers.provider.send("evm_mine", [redeemAt + 10]);
    await allPair.redeem(id, 0, 0);
  });
  it("Withdraw all funds", async function () {
    await allPair.withdrawETH(id, 0);
    await allPair.withdraw(id, 1);
  });
});
