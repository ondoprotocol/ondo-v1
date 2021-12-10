import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { mainnet } from "../scripts/utils/addresses";
import { createVault } from "../scripts/utils/helpers";
import {
  AlchemixLPStrategy,
  AllPairVault,
  ERC20,
  IMasterChefV2,
  IStakingPools,
  ISushiBar,
  IUniswapV2Router02,
  Registry,
  TrancheToken,
} from "../typechain";
use(solidity);

const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const e16 = new Decimal(10).pow(16);
const stre16 = e16.toFixed(0);
const e21 = new Decimal(10).pow(21);
const stre21 = e21.toFixed(0);
const lpTokenCount: number = 100;
const e = new Decimal(10).pow(34).mul(lpTokenCount);
const stre = e.toFixed(0);
const { provider } = ethers;

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("masterchefv2 dual incentive pool", async function () {
  let vault: AllPairVault;
  let registry: Registry;
  let trancheToken: TrancheToken;
  let strategy: AlchemixLPStrategy;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let router: IUniswapV2Router02;
  let sushiBar: ISushiBar;
  let sushi: ERC20;
  let alcx: ERC20;
  let weth: ERC20;
  let slpContract: ERC20;
  let stakingPool: IStakingPools;
  let alcxSrVault: BigNumber;
  let ethSrVault: BigNumber;
  let harvestAt: number;
  let investAt: number;
  let masterChefV2: IMasterChefV2;
  let jrTrancheTokenContract: TrancheToken;
  let srTrancheTokenContract: TrancheToken;
  before(async function () {
    this.provider = ethers.provider;
    this.originalSnapshot = await this.provider.send("evm_snapshot");
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    await deployments.fixture("AlchemixStrategy");
    alcx = await ethers.getContractAt("ERC20", mainnet.alchemix.token);
    sushi = await ethers.getContractAt("ERC20", mainnet.sushi.token);
    weth = await ethers.getContractAt("ERC20", mainnet.assets.weth);
    slpContract = await ethers.getContractAt("ERC20", mainnet.alchemix.slp);
    stakingPool = await ethers.getContractAt(
      "IStakingPools",
      mainnet.alchemix.pool
    );
    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      mainnet.sushi.router
    );
    sushiBar = await ethers.getContractAt("ISushiBar", mainnet.sushi.xsushi);
    registry = await ethers.getContract("Registry");
    trancheToken = await ethers.getContract("TrancheToken");
    vault = await ethers.getContract("AllPairVault");
    masterChefV2 = await ethers.getContractAt(
      "IMasterChefV2",
      mainnet.sushi.chef2
    );
    strategy = await ethers.getContract("AlchemixLPStrategy");

    await registry.enableTokens();
  });
  after(async function () {
    if (this.originalSnapshot) {
      await this.provider.send("evm_revert", [this.originalSnapshot]);
    }
  });
  function setup() {
    it("get assets", async function () {
      for (let i = 0; i < 6; i++) {
        let alcxBalance = await alcx.balanceOf(accounts[i]);
        await router
          .connect(signers[i])
          .swapETHForExactTokens(
            stre21,
            [mainnet.assets.weth, mainnet.alchemix.token],
            accounts[i],
            (await provider.getBlock("latest")).timestamp + 2000,
            {
              value: stre21,
            }
          );
        alcxBalance = await alcx.balanceOf(accounts[i]);
        await signers[i].sendTransaction({
          to: mainnet.assets.weth,
          value: ethers.utils.parseEther("1000.0"),
        });
      }
    });
    it("create vaults", async function () {
      let startTime = (await provider.getBlock("latest")).timestamp + 60;
      const alcxSrParams = {
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: mainnet.alchemix.token,
        juniorAsset: mainnet.assets.weth,
        hurdleRate: hurdle,
        startTime: startTime,
        enrollment: enrollment,
        duration: duration,
        seniorName: "SeniorALCX",
        seniorSym: "SRA",
        juniorName: "JuniorEth",
        juniorSym: "JRE",
      };
      const ethSrParams = {
        ...alcxSrParams,
        seniorAsset: mainnet.assets.weth,
        juniorAsset: mainnet.alchemix.token,
        seniorName: "SeniorEth",
        seniorSym: "SRE",
        juniorName: "JuniorALCX",
        juniorSym: "JRA",
      };
      this.vaultParams = ethSrParams;
      ({ investAt, harvestAt, id: alcxSrVault } = await createVault(
        vault,
        alcxSrParams
      ));
      ({ id: ethSrVault } = await createVault(vault, ethSrParams));
      let vaultDetails = await vault.getVaultById(ethSrVault);
      let srTrancheToken: string = vaultDetails.assets[0].trancheToken;
      let jrTrancheToken: string = vaultDetails.assets[1].trancheToken;
      jrTrancheTokenContract = await ethers.getContractAt(
        "TrancheToken",
        jrTrancheToken
      );
      srTrancheTokenContract = await ethers.getContractAt(
        "TrancheToken",
        srTrancheToken
      );
      await provider.send("evm_mine", [startTime]);
    });
    it("deposit assets and fast-forward", async function () {
      for (let i = 0; i < 3; i++) {
        await weth.connect(signers[i]).approve(vault.address, stre21);
        await vault.connect(signers[i]).deposit(ethSrVault, 0, stre21);
        const alcxBalance = (await alcx.balanceOf(accounts[i])).div(2);
        await alcx.connect(signers[i]).approve(vault.address, alcxBalance);
        await vault.connect(signers[i]).deposit(alcxSrVault, 0, alcxBalance);
      }
      for (let i = 3; i < 6; i++) {
        let alcxBalance = (await alcx.balanceOf(accounts[i])).div(2);
        await alcx.connect(signers[i]).approve(vault.address, alcxBalance);
        await vault.connect(signers[i]).deposit(ethSrVault, 1, alcxBalance);
        await weth.connect(signers[i]).approve(vault.address, stre21);
        await vault.connect(signers[i]).deposit(alcxSrVault, 1, stre21);
        alcxBalance = await alcx.balanceOf(accounts[i]);
      }
      await provider.send("evm_mine", [investAt]);
    });
  }
  function invest() {
    it("invest ALCX/ETH vault", async function () {
      let amounts = await vault.callStatic.invest(alcxSrVault, 0, 0);
      this.seniorInvested = new Decimal(amounts[0].toString()).div(stre18);
      this.juniorInvested = ethers.BigNumber.from(amounts[1].toString()).div(
        stre18
      );
      const { amount: abefore } = await masterChefV2.userInfo(
        0,
        strategy.address
      );
      await vault.invest(alcxSrVault, 0, 0);
      const { amount: aafter } = await masterChefV2.userInfo(
        0,
        strategy.address
      );
      expect(aafter).gt(abefore);
    });
    it("invest ETH/ALCX vault", async function () {
      const { amount: abefore } = await masterChefV2.userInfo(
        0,
        strategy.address
      );
      await vault.invest(ethSrVault, 0, 0);
      const { amount: aafter } = await masterChefV2.userInfo(
        0,
        strategy.address
      );
      expect(aafter).gt(abefore);
    });
  }
  function harvest() {
    it("harvest", async function () {
      await provider.send("evm_mine", [harvestAt]);
      harvestAt += duration / 7;
      const { amount: abefore } = await masterChefV2.userInfo(
        0,
        strategy.address
      );
      await strategy.harvest(0);
      const { amount: aafter } = await masterChefV2.userInfo(
        0,
        strategy.address
      );
      expect(aafter).gt(abefore);
    });
  }
  function redeem() {
    it("redeem ALCX/ETH vault", async function () {
      await provider.send("evm_mine", [
        (await vault.getVaultById(alcxSrVault)).redeemAt.toNumber(),
      ]);
      await vault.redeem(alcxSrVault, 0, 0);
    });
    it("redeem ETH/ALCX vault", async function () {
      await vault.redeem(ethSrVault, 0, 0);
    });
  }
  function withdrawDepositLp() {
    it("get LP from the sushiswap pool and deposit", async function () {
      await signers[0].sendTransaction({
        to: mainnet.assets.weth,
        value: ethers.utils.parseEther("10.0"),
      });
      await weth.approve(router.address, await weth.balanceOf(accounts[0]));
      await alcx.approve(router.address, await alcx.balanceOf(accounts[0]));
      let x = await router.callStatic.addLiquidity(
        weth.address,
        alcx.address,
        await stre18,
        await ethers.BigNumber.from(stre18).mul(5),
        0,
        0,
        accounts[0],
        (await provider.getBlock("latest")).timestamp + 60
      );
      await router.addLiquidity(
        weth.address,
        alcx.address,
        await stre18,
        await ethers.BigNumber.from(stre18).mul(5),
        0,
        0,
        accounts[0],
        (await provider.getBlock("latest")).timestamp + 60
      );
      const lpBoughtFromAMM = x[2].div(stre18);
      let lpBalanceBeforeDeposit = (
        await slpContract.balanceOf(accounts[0])
      ).div(stre18);
      await slpContract.approve(vault.address, stre18);
      await vault.connect(signers[0]).depositLp(alcxSrVault, stre18);
      let lpBalanceAfterDeposit = (
        await slpContract.balanceOf(accounts[0])
      ).div(stre18);
      expect(lpBalanceBeforeDeposit).eq(1);
      expect(lpBalanceAfterDeposit).eq(0);
      expect(lpBoughtFromAMM).eq(1);
    });
    it("withdraw LP from ALCX/ETH vault", async function () {
      let alcxSrVaultDetails = await vault.getVaultById(alcxSrVault);
      let srTrancheToken_alcxSrVault =
        alcxSrVaultDetails.assets[0].trancheToken;
      let jrTrancheToken_alcxSrVault =
        alcxSrVaultDetails.assets[1].trancheToken;
      let jrTrancheTokenContract = await ethers.getContractAt(
        "TrancheToken",
        jrTrancheToken_alcxSrVault
      );
      let srTrancheTokenContract = await ethers.getContractAt(
        "TrancheToken",
        srTrancheToken_alcxSrVault
      );
      let balance = await srTrancheTokenContract
        .connect(signers[0])
        .balanceOf(accounts[0]);
      await vault.connect(signers[0]).claim(alcxSrVault, 0);
      await vault.connect(signers[3]).claim(alcxSrVault, 1);
      let balanceJrTrancheTokens = await jrTrancheTokenContract
        .connect(signers[3])
        .balanceOf(accounts[3]);
      await jrTrancheTokenContract
        .connect(signers[3])
        .transfer(accounts[0], balanceJrTrancheTokens);
      await vault.connect(signers[0]).withdrawLp(alcxSrVault, stre18);
      let lpBalanceAfterWithdrawn = (
        await slpContract.balanceOf(accounts[0])
      ).div(stre18);
      expect(lpBalanceAfterWithdrawn).eq(1);
    });
    it("deposit LP in ALCX/ETH vault", async function () {
      let lpBalanceBeforeDeposit = (
        await slpContract.balanceOf(accounts[0])
      ).div(stre18);
      await slpContract.approve(vault.address, stre18);
      await vault.connect(signers[0]).depositLp(alcxSrVault, stre18);
      let lpBalanceAfterDeposit = (
        await slpContract.balanceOf(accounts[0])
      ).div(stre18);
      expect(lpBalanceBeforeDeposit).eq(1);
      expect(lpBalanceAfterDeposit).eq(0);
    });
  }
  describe("mcv2 vault lifecycle", async function () {
    setup();
    invest();
    withdrawDepositLp();
    harvest();
    harvest();
    harvest();
    harvest();
    harvest();
    harvest();
    redeem();
  });
});
