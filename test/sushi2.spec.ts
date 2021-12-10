import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { mainnet } from "../scripts/utils/addresses";
import { createVault } from "../scripts/utils/helpers";
import {
  AllPairVault,
  ERC20,
  IMasterChefV2,
  IStakingPools,
  ISushiBar,
  IUniswapV2Router02,
  Registry,
  TrancheToken,
  SushiStakingV2Strategy,
  AlchemixUserReward,
} from "../typechain";
use(solidity);

const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const { provider } = ethers;

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("SushiStakingV2Strategy - Alchemix helper", async function () {
  let vault: AllPairVault;
  let registry: Registry;
  let trancheToken: TrancheToken;
  let strategy: SushiStakingV2Strategy;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let router: IUniswapV2Router02;
  let sushiBar: ISushiBar;
  let sushi: ERC20;
  let alcx: ERC20;
  let weth: ERC20;
  let stakingPool: IStakingPools;
  let alcxSrVault: BigNumber;
  let ethSrVault: BigNumber;
  let harvestAt: number;
  let investAt: number;
  let masterChefV2: IMasterChefV2;
  let rewardHandler: AlchemixUserReward;
  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    await deployments.fixture("SushiStakingV2Strategy");
    await deployments.fixture("AlchemixUserReward");
    alcx = await ethers.getContractAt("ERC20", mainnet.alchemix.token);
    sushi = await ethers.getContractAt("ERC20", mainnet.sushi.token);
    weth = await ethers.getContractAt("ERC20", mainnet.assets.weth);
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
    strategy = await ethers.getContract("SushiStakingV2Strategy");
    rewardHandler = await ethers.getContract("AlchemixUserReward");
    await registry.enableTokens();
  });
  function setup() {
    it("get assets", async function () {
      for (let i = 0; i < 6; i++) {
        await router
          .connect(signers[i])
          .swapETHForExactTokens(
            stre18,
            [mainnet.assets.weth, mainnet.alchemix.token],
            accounts[i],
            (await provider.getBlock("latest")).timestamp + 2000,
            {
              value: stre18,
            }
          );
        await signers[i].sendTransaction({
          to: mainnet.assets.weth,
          value: ethers.utils.parseEther("1.0"),
        });
      }
    });
    it("add pool", async function () {
      await strategy.addPool(
        mainnet.alchemix.slp,
        0,
        [[mainnet.sushi.token, mainnet.assets.weth], [mainnet.alchemix.token]],
        rewardHandler.address
      );
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
      ({ investAt, harvestAt, id: alcxSrVault } = await createVault(
        vault,
        alcxSrParams
      ));

      ({ id: ethSrVault } = await createVault(vault, ethSrParams));
      await provider.send("evm_mine", [startTime]);
    });
    it("deposit assets and fast-forward", async function () {
      for (let i = 0; i < 3; i++) {
        await weth.connect(signers[i]).approve(vault.address, stre18);
        await vault.connect(signers[i]).deposit(ethSrVault, 0, stre18);
        const alcxBalance = await alcx.balanceOf(accounts[i]);
        await alcx.connect(signers[i]).approve(vault.address, alcxBalance);
        await vault.connect(signers[i]).deposit(alcxSrVault, 0, alcxBalance);
      }
      for (let i = 3; i < 6; i++) {
        const alcxBalance = await alcx.balanceOf(accounts[i]);
        await alcx.connect(signers[i]).approve(vault.address, alcxBalance);
        await vault.connect(signers[i]).deposit(ethSrVault, 1, alcxBalance);
        await weth.connect(signers[i]).approve(vault.address, stre18);
        await vault.connect(signers[i]).deposit(alcxSrVault, 1, stre18);
      }
      await provider.send("evm_mine", [investAt]);
    });
  }
  function invest() {
    it("invest ALCX/ETH vault", async function () {
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
      await strategy.harvest(mainnet.alchemix.slp, 0);
      const { amount: aafter } = await masterChefV2.userInfo(
        0,
        strategy.address
      );
      expect(aafter).gt(abefore);
    });
  }

  function multicall() {
    it("can multicall", async function () {
      const encoded = masterChefV2.interface.encodeFunctionData("userInfo", [
        ethers.utils.parseEther("0"),
        strategy.address,
      ]);
      await strategy.multiexcall([
        { target: masterChefV2.address, data: encoded },
      ]);
    });
    it("cant multicall of not creator", async function () {
      const encoded = masterChefV2.interface.encodeFunctionData("userInfo", [
        ethers.utils.parseEther("0"),
        strategy.address,
      ]);
      await expect(
        strategy
          .connect(signers[1])
          .multiexcall([{ target: masterChefV2.address, data: encoded }])
      ).revertedWith("Unauthorized");
    });
    it("can emergency withdraw using multicall", async function () {
      const sushiBalance = await sushi.balanceOf(strategy.address);
      const alcxBalance = await alcx.balanceOf(strategy.address);
      await provider.send("evm_mine", [harvestAt + 1000]);
      const encoded = masterChefV2.interface.encodeFunctionData(
        "emergencyWithdraw",
        [0, strategy.address]
      );
      await strategy.multiexcall([
        { target: masterChefV2.address, data: encoded },
      ]);
      const alcxBalanceAfter = await alcx.balanceOf(strategy.address);
      expect(alcxBalanceAfter).gt(alcxBalance);
    });
  }

  function redeem() {
    it("redeem ALCX/ETH vault", async function () {
      await provider.send("evm_mine", [
        (await vault.getVaultById(alcxSrVault)).redeemAt.toNumber() + 10000,
      ]);
      await vault.redeem(alcxSrVault, 0, 0);
    });
    it("redeem ETH/ALCX vault", async function () {
      await vault.redeem(ethSrVault, 0, 0);
    });
  }
  describe("alchemix vault lifecycle", async function () {
    setup();
    invest();
    harvest();
    harvest();
    harvest();
    harvest();
    harvest();
    harvest();
    //    multicall();
    redeem();
  });
});
