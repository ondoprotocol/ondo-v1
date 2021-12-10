import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { quickswapLP, polygonMainnet } from "./utils/addresses";
import {
  AllPairVault,
  AllPairVault__factory,
  QuickSwapStrategyLP,
  QuickSwapStrategyLP__factory,
  Registry,
  Registry__factory,
  //RolloverVault,
  //RolloverVault__factory,
  TrancheToken,
  TrancheToken__factory,
  IUniswapV2Router02,
  IWETH,
  IERC20,
} from "../../typechain";
import { keccak256 } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import internal from "stream";
use(solidity);

const quickMaticPairAddress = "0x019ba0325f1988213D448b3472fA1cf8D07618d7";
const quickMaticPairId = 999; // Just a dummy number here.
const usdcUsdtPairAddress = "0x2cf7252e74036d1da831d11089d326296e64a728";
const usdcUsdtPairId = 998;

const e18 = BigNumber.from("10").pow(18);
const e18str = e18.toString();
const { provider } = ethers;

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

type VaultParams = {
  seniorAsset: string;
  juniorAsset: string;
  strategist: string;
  strategy: string;
  hurdleRate: number;
  startTime: number;
  enrollment: number;
  duration: number;
  seniorName: string;
  seniorSym: string;
  juniorName: string;
  juniorSym: string;
  seniorTrancheCap: number;
  juniorTrancheCap: number;
  seniorUserCap: number;
  juniorUserCap: number;
};

const getNewVaultId = async (vault: VaultParams) => {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "address",
      "address",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
    ],
    [
      vault.seniorAsset,
      vault.juniorAsset,
      vault.strategy,
      vault.hurdleRate,
      vault.startTime,
      vault.startTime + vault.enrollment,
      vault.startTime + vault.enrollment + vault.duration,
    ]
  );
  return ethers.BigNumber.from(ethers.utils.keccak256(encoded)).toString();
};

describe("QuickSwap", () => {
  const srId = 0;
  const jrId = 1;

  const depositSrUser1 = e18.mul(2);
  const depositJrUser1 = e18.mul(2);
  const depositSrUser2 = e18.mul(2);
  const depositJrUser2 = e18.mul(2);
  let depositedQuickMaticLP: BigNumber = BigNumber.from(0);
  let depositedUsdcUsdtLP: BigNumber = BigNumber.from(0);

  let signers: SignerWithAddress[];
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let registry: Registry;
  let allPairVault: AllPairVault;
  //let rollover: RolloverVault;
  let trancheToken: TrancheToken;
  let quickSwapStrategy: QuickSwapStrategyLP;
  let router: IUniswapV2Router02;
  let wMatic: IWETH;
  let quick: IERC20;
  let usdt: IERC20;
  let usdc: IERC20;
  let quickMaticPair: IERC20;
  let usdcUsdtPair: IERC20;
  let srTrancheTokenQuickMatic: TrancheToken;
  let jrTrancheTokenQuickMatic: TrancheToken;
  let srTrancheTokenUsdcUsdt: TrancheToken;
  let jrTrancheTokenUsdcUsdt: TrancheToken;
  let quickMaticVaultId: string;
  let usdcUsdtVaultId: string;

  const increaseTime = async (time: number) => {
    await provider.send("evm_increaseTime", [Math.floor(time)]);
  };

  before(async function () {
    signers = await ethers.getSigners();
    signer = signers[0];
    user1 = signers[1];
    user2 = signers[2];
    const registryFactory = new Registry__factory(signer);
    const allPairVaultFactory = new AllPairVault__factory(signer);
    //const rolloverFactory = new RolloverVault__factory(signer);
    const trancheTokenFactory = new TrancheToken__factory(signer);
    const quickSwapStrategyFactory = new QuickSwapStrategyLP__factory(signer);
    trancheToken = await trancheTokenFactory.deploy();
    registry = await registryFactory.deploy(
      signer.address,
      signer.address,
      polygonMainnet.assets.weth
    );
    allPairVault = await allPairVaultFactory.deploy(
      registry.address,
      trancheToken.address
    );
    quickSwapStrategy = await quickSwapStrategyFactory.deploy(
      registry.address,
      quickswapLP.router,
      quickswapLP.chef,
      quickswapLP.factory,
      quickswapLP.token,
      quickswapLP.staking
    );

    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      quickswapLP.router,
      signer
    );

    wMatic = await ethers.getContractAt(
      "IWETH",
      polygonMainnet.assets.weth,
      signer
    );

    quick = await ethers.getContractAt("IERC20", quickswapLP.token, signer);

    quickMaticPair = await ethers.getContractAt(
      "IERC20",
      quickMaticPairAddress,
      signer
    );

    usdc = await ethers.getContractAt(
      "IERC20",
      polygonMainnet.assets.usdc,
      signer
    );

    usdt = await ethers.getContractAt(
      "IERC20",
      polygonMainnet.assets.usdt,
      signer
    );

    usdcUsdtPair = await ethers.getContractAt(
      "IERC20",
      usdcUsdtPairAddress,
      signer
    );

    await registry.grantRole(
      keccak256(Buffer.from("DEPLOYER_ROLE", "utf-8")),
      signer.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("CREATOR_ROLE", "utf-8")),
      signer.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("STRATEGIST_ROLE", "utf-8")),
      signer.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("STRATEGY_ROLE", "utf-8")),
      quickSwapStrategy.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("VAULT_ROLE", "utf-8")),
      allPairVault.address
    );

    /*rollover = await rolloverFactory.deploy(
      allPairVault.address,
      registry.address,
      trancheToken.address
    );

    await registry.grantRole(
      keccak256(Buffer.from("ROLLOVER_ROLE", "utf-8")),
      rollover.address
    );*/
  });

  describe("Pools", () => {
    it("should be NOT possible to add pool if zero pool address", async function () {
      await expect(
        quickSwapStrategy.addPool(polygonMainnet.zero, "0", [])
      ).to.be.revertedWith("'Cannot be zero address");
    });

    it("should be NOT possible to add a pool if the pool has quick token and NON-zero length path", async function () {
      await expect(
        quickSwapStrategy.addPool(quickMaticPairAddress, quickMaticPairId, [
          polygonMainnet.zero,
        ])
      ).to.be.revertedWith(
        "Pool either must have main token and zero length or no main token in pool"
      );
    });

    it("should NOT be possible to add a pool with no quick token and wrong path", async () => {
      await expect(
        quickSwapStrategy.addPool(usdcUsdtPairAddress, usdcUsdtPairId, [
          polygonMainnet.zero,
        ])
      ).to.be.revertedWith("Not a valid path for pool");
    });

    it("should be possible to add a pool with quick token", async function () {
      await quickSwapStrategy.addPool(
        quickMaticPairAddress,
        quickMaticPairId,
        []
      );
    });

    it("should be possible to add a pool with no quick token but a valid path", async () => {
      await quickSwapStrategy.addPool(usdcUsdtPairAddress, usdcUsdtPairId, [
        polygonMainnet.assets.usdc,
      ]);
    });

    it("should NOT be possible to add a pool if it's already registered", async function () {
      await expect(
        quickSwapStrategy.addPool(quickMaticPairAddress, quickMaticPairId, [])
      ).to.be.revertedWith("Pool ID already registered");
    });

    it("should NOT be possible to update an unregistered pool", async () => {
      await expect(
        quickSwapStrategy.updatePool(signer.address, [])
      ).to.be.revertedWith("Pool ID not yet registered");
    });

    it("should NOT be possible to update a pool if NOT a valid path for pool", async () => {
      await expect(
        quickSwapStrategy.updatePool(usdcUsdtPairAddress, [polygonMainnet.zero])
      ).to.be.revertedWith("Not a valid path for pool");
    });

    it("should NOT be possible to update a pool if the pool is with quick token", async () => {
      await expect(
        quickSwapStrategy.updatePool(quickMaticPairAddress, [])
      ).to.be.revertedWith("Should never need to update pool with main token");
    });

    it("should be possible to update a pool if pool with no quick token and has a valid path", async () => {
      await quickSwapStrategy.updatePool(usdcUsdtPairAddress, [
        polygonMainnet.assets.usdt,
      ]);
    });
  });

  describe("Vaults", async () => {
    it("should be possible to create a vault", async function () {
      const now: number = (await provider.getBlock("latest")).timestamp;

      const hurdleRate = 10000;
      const startTime = now + 30;
      const enrollment = 60;
      const duration = 300;
      const seniorName = "QuickSwap Tranche Token";
      const seniorSym = "QuickTT";
      const juniorName = "Wrapped MATIC Tranche Token";
      const juniorSym = "WMaticTT";
      const seniorTrancheCap = 0;
      const juniorTrancheCap = 0;
      const seniorUserCap = 0;
      const juniorUserCap = 0;

      const vault: VaultParams = {
        seniorAsset: quickswapLP.token,
        juniorAsset: polygonMainnet.assets.weth,
        strategist: signer.address,
        strategy: quickSwapStrategy.address,
        hurdleRate,
        startTime,
        enrollment,
        duration,
        seniorName,
        seniorSym,
        juniorName,
        juniorSym,
        seniorTrancheCap,
        juniorTrancheCap,
        seniorUserCap,
        juniorUserCap,
      };

      quickMaticVaultId = await getNewVaultId(vault);

      await allPairVault.createVault(vault);

      const vaultView = await allPairVault.getVaultById(quickMaticVaultId);

      srTrancheTokenQuickMatic = await ethers.getContractAt(
        "TrancheToken",
        vaultView.assets[0].trancheToken,
        signer
      );
      jrTrancheTokenQuickMatic = await ethers.getContractAt(
        "TrancheToken",
        vaultView.assets[1].trancheToken,
        signer
      );

      const srTokenVault = await allPairVault.VaultsByTokens(
        srTrancheTokenQuickMatic.address
      );
      const jrTokenVault = await allPairVault.VaultsByTokens(
        jrTrancheTokenQuickMatic.address
      );

      expect(srTokenVault.toString()).equal(quickMaticVaultId);
      expect(jrTokenVault.toString()).equal(quickMaticVaultId);

      expect((await srTrancheTokenQuickMatic.vaultId()).toString()).equal(
        quickMaticVaultId
      );
      expect((await jrTrancheTokenQuickMatic.vaultId()).toString()).equal(
        quickMaticVaultId
      );
      expect(await srTrancheTokenQuickMatic.vault()).equal(
        allPairVault.address
      );
      expect(await jrTrancheTokenQuickMatic.vault()).equal(
        allPairVault.address
      );
      expect(await srTrancheTokenQuickMatic.symbol()).equal(seniorSym);
      expect(await jrTrancheTokenQuickMatic.symbol()).equal(juniorSym);
      expect(await srTrancheTokenQuickMatic.name()).equal(seniorName);
      expect(await jrTrancheTokenQuickMatic.name()).equal(juniorName);

      expect(vaultView.strategy).equal(quickSwapStrategy.address);
      expect(vaultView.creator).equal(signer.address);
      expect(vaultView.strategist).equal(signer.address);
      //expect(vaultView.rollover).equal(polygonMainnet.zero);
      expect(vaultView.hurdleRate.toString()).equal(hurdleRate.toString());
      expect(vaultView.state).equal(0);
      expect(vaultView.startAt.toString()).equal(startTime.toString());
      expect(vaultView.investAt.toString()).equal(
        BigNumber.from(startTime + enrollment).toString()
      );
      expect(vaultView.redeemAt.toString()).equal(
        BigNumber.from(startTime + enrollment + duration).toString()
      );
    });

    it("should be possible to create a vault for a pair with no quick", async () => {
      const now: number = (await provider.getBlock("latest")).timestamp;

      const hurdleRate = hurdle;
      const startTime = now + 10;
      const enrollment = 60;
      const duration = 300;
      const seniorName = "Usdc Tranche Token";
      const seniorSym = "UsdcTT";
      const juniorName = "Usdt Tranche Token";
      const juniorSym = "UsdtTT";
      const seniorTrancheCap = 0;
      const juniorTrancheCap = 0;
      const seniorUserCap = 0;
      const juniorUserCap = 0;

      const vault: VaultParams = {
        seniorAsset: polygonMainnet.assets.usdc,
        juniorAsset: polygonMainnet.assets.usdt,
        strategist: signer.address,
        strategy: quickSwapStrategy.address,
        hurdleRate,
        startTime,
        enrollment,
        duration,
        seniorName,
        seniorSym,
        juniorName,
        juniorSym,
        seniorTrancheCap,
        juniorTrancheCap,
        seniorUserCap,
        juniorUserCap,
      };

      usdcUsdtVaultId = await getNewVaultId(vault);

      await allPairVault.createVault(vault);

      const vaultView = await allPairVault.getVaultById(usdcUsdtVaultId);

      srTrancheTokenUsdcUsdt = await ethers.getContractAt(
        "TrancheToken",
        vaultView.assets[0].trancheToken,
        signer
      );
      jrTrancheTokenUsdcUsdt = await ethers.getContractAt(
        "TrancheToken",
        vaultView.assets[1].trancheToken,
        signer
      );

      const srTokenVault = await allPairVault.VaultsByTokens(
        srTrancheTokenUsdcUsdt.address
      );
      const jrTokenVault = await allPairVault.VaultsByTokens(
        jrTrancheTokenUsdcUsdt.address
      );

      expect(srTokenVault.toString()).equal(usdcUsdtVaultId);
      expect(jrTokenVault.toString()).equal(usdcUsdtVaultId);

      expect((await srTrancheTokenUsdcUsdt.vaultId()).toString()).equal(
        usdcUsdtVaultId
      );
      expect((await jrTrancheTokenUsdcUsdt.vaultId()).toString()).equal(
        usdcUsdtVaultId
      );
      expect(await srTrancheTokenUsdcUsdt.vault()).equal(allPairVault.address);
      expect(await jrTrancheTokenUsdcUsdt.vault()).equal(allPairVault.address);
      expect(await srTrancheTokenUsdcUsdt.symbol()).equal(seniorSym);
      expect(await jrTrancheTokenUsdcUsdt.symbol()).equal(juniorSym);
      expect(await srTrancheTokenUsdcUsdt.name()).equal(seniorName);
      expect(await jrTrancheTokenUsdcUsdt.name()).equal(juniorName);

      expect(vaultView.strategy).equal(quickSwapStrategy.address);
      expect(vaultView.creator).equal(signer.address);
      expect(vaultView.strategist).equal(signer.address);
      //expect(vaultView.rollover).equal(polygonMainnet.zero);
      expect(vaultView.hurdleRate.toString()).equal(hurdleRate.toString());
      expect(vaultView.state).equal(0);
      expect(vaultView.startAt.toString()).equal(startTime.toString());
      expect(vaultView.investAt.toString()).equal(
        BigNumber.from(startTime + enrollment).toString()
      );
      expect(vaultView.redeemAt.toString()).equal(
        BigNumber.from(startTime + enrollment + duration).toString()
      );
    });
  });

  describe("Deposit", () => {
    before(async () => {
      await user1.sendTransaction({
        to: wMatic.address,
        value: e18.mul(2000),
      });

      await user2.sendTransaction({
        to: wMatic.address,
        value: e18.mul(2000),
      });

      await increaseTime(1);

      await router.swapExactETHForTokens(
        0,
        [wMatic.address, quick.address],
        user1.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(2000),
        }
      );
      await router.swapExactETHForTokens(
        0,
        [wMatic.address, polygonMainnet.assets.usdc],
        user1.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(1000),
        }
      );
      await router.swapExactETHForTokens(
        0,
        [wMatic.address, polygonMainnet.assets.usdt],
        user1.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(1000),
        }
      );
      await router.swapExactETHForTokens(
        0,
        [wMatic.address, quick.address],
        user2.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(2000),
        }
      );
      await router.swapExactETHForTokens(
        0,
        [wMatic.address, polygonMainnet.assets.usdc],
        user2.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(1000),
        }
      );
      await router.swapExactETHForTokens(
        0,
        [wMatic.address, polygonMainnet.assets.usdt],
        user2.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(1000),
        }
      );
    });

    it("should be possible to deposit senior and junior tokens", async () => {
      await increaseTime(100);
      await quick.connect(user1).approve(allPairVault.address, depositSrUser1);
      await wMatic.connect(user1).approve(allPairVault.address, depositJrUser1);
      await quick.connect(user2).approve(allPairVault.address, depositSrUser2);
      await wMatic.connect(user2).approve(allPairVault.address, depositJrUser2);
      await usdc.connect(user1).approve(allPairVault.address, depositSrUser1);
      await usdt.connect(user1).approve(allPairVault.address, depositJrUser1);
      await usdc.connect(user2).approve(allPairVault.address, depositSrUser2);
      await usdt.connect(user2).approve(allPairVault.address, depositJrUser2);

      const balanceSrTokenUser1 = await quick.balanceOf(user1.address);
      const balanceSrTokenUser2 = await quick.balanceOf(user2.address);
      const balanceJrTokenUser1 = await wMatic.balanceOf(user1.address);
      const balanceJrTokenUser2 = await wMatic.balanceOf(user2.address);
      const balanceSrTokenUsdcUsdtUser1 = await usdc.balanceOf(user1.address);
      const balanceSrTokenUsdcUsdtUser2 = await usdc.balanceOf(user2.address);
      const balanceJrTokenUsdcUsdtUser1 = await usdt.balanceOf(user1.address);
      const balanceJrTokenUsdcUsdtUser2 = await usdt.balanceOf(user2.address);

      await allPairVault
        .connect(user1)
        .deposit(quickMaticVaultId, srId, depositSrUser1);
      await allPairVault
        .connect(user1)
        .deposit(quickMaticVaultId, jrId, depositJrUser1);
      await allPairVault
        .connect(user2)
        .deposit(quickMaticVaultId, srId, depositSrUser2);
      await allPairVault
        .connect(user2)
        .deposit(quickMaticVaultId, jrId, depositJrUser2);
      await allPairVault
        .connect(user1)
        .deposit(usdcUsdtVaultId, srId, depositSrUser1.div(2000000000));
      await allPairVault
        .connect(user1)
        .deposit(usdcUsdtVaultId, jrId, depositJrUser1.div(2000000000));
      await allPairVault
        .connect(user2)
        .deposit(usdcUsdtVaultId, srId, depositSrUser2.div(2000000000));
      await allPairVault
        .connect(user2)
        .deposit(usdcUsdtVaultId, jrId, depositJrUser2.div(2000000000));
      expect(
        balanceSrTokenUser1.sub(await quick.balanceOf(user1.address)).toString()
      ).equal(depositSrUser1.toString());
      expect(
        balanceJrTokenUser1
          .sub(await wMatic.balanceOf(user1.address))
          .toString()
      ).equal(depositJrUser1.toString());
      expect(
        balanceSrTokenUser2.sub(await quick.balanceOf(user2.address)).toString()
      ).equal(depositSrUser2.toString());
      expect(
        balanceJrTokenUser2
          .sub(await wMatic.balanceOf(user2.address))
          .toString()
      ).equal(depositJrUser2.toString());
      expect(
        balanceSrTokenUsdcUsdtUser1
          .sub(await usdc.balanceOf(user1.address))
          .toString()
      ).equal(depositSrUser1.div(2000000000).toString());
      expect(
        balanceJrTokenUsdcUsdtUser1
          .sub(await usdt.balanceOf(user1.address))
          .toString()
      ).equal(depositJrUser1.div(2000000000).toString());
      expect(
        balanceSrTokenUsdcUsdtUser2
          .sub(await usdc.balanceOf(user2.address))
          .toString()
      ).equal(depositSrUser2.div(2000000000).toString());
      expect(
        balanceJrTokenUsdcUsdtUser2
          .sub(await usdt.balanceOf(user2.address))
          .toString()
      ).equal(depositJrUser2.div(2000000000).toString());

      const quickMaticVaultView = await allPairVault.getVaultById(
        quickMaticVaultId
      );
      const usdcUsdtVaultView = await allPairVault.getVaultById(
        usdcUsdtVaultId
      );

      expect(quickMaticVaultView.assets[srId].deposited.toString()).equal(
        depositSrUser1.add(depositSrUser2).toString()
      );
      expect(quickMaticVaultView.assets[jrId].deposited.toString()).equal(
        depositJrUser1.add(depositJrUser2).toString()
      );
      expect(usdcUsdtVaultView.assets[srId].deposited.toString()).equal(
        depositSrUser1
          .div(2000000000)
          .add(depositSrUser2.div(2000000000))
          .toString()
      );
      expect(usdcUsdtVaultView.assets[jrId].deposited.toString()).equal(
        depositJrUser1
          .div(2000000000)
          .add(depositJrUser2.div(2000000000))
          .toString()
      );

      expect(
        (
          await allPairVault
            .connect(user1)
            .vaultInvestor(quickMaticVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal(depositSrUser1.toString());
      expect(
        (
          await allPairVault
            .connect(user1)
            .vaultInvestor(quickMaticVaultId, jrId)
        ).withdrawableExcess.toString()
      ).equal(depositJrUser1.toString());
      expect(
        (
          await allPairVault
            .connect(user2)
            .vaultInvestor(quickMaticVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal(depositSrUser2.toString());
      expect(
        (
          await allPairVault
            .connect(user2)
            .vaultInvestor(quickMaticVaultId, jrId)
        ).withdrawableExcess.toString()
      ).equal(depositJrUser2.toString());
      expect(
        (
          await allPairVault.connect(user1).vaultInvestor(usdcUsdtVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal(depositSrUser1.div(2000000000).toString());
      expect(
        (
          await allPairVault.connect(user1).vaultInvestor(usdcUsdtVaultId, jrId)
        ).withdrawableExcess.toString()
      ).equal(depositJrUser1.div(2000000000).toString());
      expect(
        (
          await allPairVault.connect(user2).vaultInvestor(usdcUsdtVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal(depositSrUser2.div(2000000000).toString());
      expect(
        (
          await allPairVault.connect(user2).vaultInvestor(usdcUsdtVaultId, jrId)
        ).withdrawableExcess.toString()
      ).equal(depositJrUser2.div(2000000000).toString());
    });
  });

  describe("Invest", () => {
    before(async () => {
      await registry.connect(signer).enableTokens();
      await increaseTime(enrollment);
    });

    it("should be possible to invest assets", async () => {
      let quickMaticVaultView = await allPairVault.getVaultById(
        quickMaticVaultId
      );
      let usdcUsdtVaultView = await allPairVault.getVaultById(usdcUsdtVaultId);

      expect(quickMaticVaultView.state).equal(1);
      expect(usdcUsdtVaultView.state).equal(1);

      expect(
        quickMaticVaultView.assets[srId].originalInvested.toString()
      ).equal("0");
      expect(
        quickMaticVaultView.assets[jrId].originalInvested.toString()
      ).equal("0");
      expect(quickMaticVaultView.assets[srId].totalInvested.toString()).equal(
        "0"
      );
      expect(quickMaticVaultView.assets[jrId].totalInvested.toString()).equal(
        "0"
      );
      expect(usdcUsdtVaultView.assets[srId].originalInvested.toString()).equal(
        "0"
      );
      expect(usdcUsdtVaultView.assets[jrId].originalInvested.toString()).equal(
        "0"
      );
      expect(usdcUsdtVaultView.assets[srId].totalInvested.toString()).equal(
        "0"
      );
      expect(usdcUsdtVaultView.assets[jrId].totalInvested.toString()).equal(
        "0"
      );

      await allPairVault.invest(quickMaticVaultId, 0, 0);
      await allPairVault.invest(usdcUsdtVaultId, 0, 0);

      quickMaticVaultView = await allPairVault.getVaultById(quickMaticVaultId);
      usdcUsdtVaultView = await allPairVault.getVaultById(quickMaticVaultId);

      expect(quickMaticVaultView.state).equal(2);
      expect(usdcUsdtVaultView.state).equal(2);

      expect(quickMaticVaultView.assets[srId].originalInvested).gt(0);
      expect(quickMaticVaultView.assets[srId].totalInvested).gt(0);
      expect(usdcUsdtVaultView.assets[srId].originalInvested).gt(0);
      expect(usdcUsdtVaultView.assets[srId].totalInvested).gt(0);
    });
  });

  describe("Claim", () => {
    it("should be possible to claim tokens", async () => {
      await allPairVault.connect(user1).claim(quickMaticVaultId, srId);
      await allPairVault.connect(user2).claim(quickMaticVaultId, srId);
      await allPairVault.connect(user1).claim(usdcUsdtVaultId, jrId);
      await allPairVault.connect(user2).claim(usdcUsdtVaultId, jrId);

      expect(
        (await srTrancheTokenQuickMatic.balanceOf(user1.address)).toString(),
        depositSrUser1.toString()
      );
      expect(
        (await srTrancheTokenQuickMatic.balanceOf(user2.address)).toString(),
        depositSrUser2.toString()
      );
      expect(
        (await jrTrancheTokenUsdcUsdt.balanceOf(user1.address)).toString(),
        depositJrUser1.toString()
      );
      expect(
        (await jrTrancheTokenUsdcUsdt.balanceOf(user2.address)).toString(),
        depositJrUser2.toString()
      );
    });
  });

  describe("DepositLp", () => {
    it("should be possible to deposit LP tokens", async () => {
      await quick.connect(user1).approve(quickswapLP.router, e18.mul(1));
      await wMatic.connect(user1).approve(quickswapLP.router, e18.mul(100));

      let now: number = (await provider.getBlock("latest")).timestamp;

      await router
        .connect(user1)
        .addLiquidity(
          quick.address,
          wMatic.address,
          e18.mul(2),
          e18.mul(100),
          0,
          0,
          user1.address,
          now + 20
        );

      depositedQuickMaticLP = await quickMaticPair.balanceOf(user1.address);

      await quickMaticPair
        .connect(user1)
        .approve(allPairVault.address, depositedQuickMaticLP);

      await allPairVault
        .connect(user1)
        .depositLp(quickMaticVaultId, depositedQuickMaticLP);

      await usdc.connect(user2).approve(quickswapLP.router, 400000000);
      await usdt.connect(user2).approve(quickswapLP.router, 400000000);

      now = (await provider.getBlock("latest")).timestamp;

      await router
        .connect(user2)
        .addLiquidity(
          polygonMainnet.assets.usdc,
          polygonMainnet.assets.usdt,
          400000000,
          400000000,
          0,
          0,
          user2.address,
          now + 20
        );

      depositedUsdcUsdtLP = await usdcUsdtPair.balanceOf(user2.address);

      await usdcUsdtPair
        .connect(user2)
        .approve(allPairVault.address, depositedUsdcUsdtLP);

      await allPairVault
        .connect(user2)
        .depositLp(usdcUsdtVaultId, depositedUsdcUsdtLP);
    });
  });

  describe("withdrawLP", () => {
    it("should be possible to withdraw LP tokens", async () => {
      await allPairVault
        .connect(user1)
        .withdrawLp(quickMaticVaultId, depositedQuickMaticLP);
    });

    it("should be possible to withdraw LP tokens 2", async () => {
      await allPairVault
        .connect(user2)
        .withdrawLp(usdcUsdtVaultId, depositedUsdcUsdtLP);
    });
  });

  describe("Harvest", () => {
    it("should be possible to harvest", async () => {
      await expect(
        quickSwapStrategy.connect(user1).harvest(quickMaticPair.address, 0)
      ).to.be.revertedWith("Unauthorized");
      await quickSwapStrategy
        .connect(signer)
        .harvest(quickMaticPair.address, 0);
      await quickSwapStrategy.connect(signer).harvest(usdcUsdtPair.address, 0);
    });
  });

  describe("Redeem", () => {
    before(async () => {
      await increaseTime(duration);
    });

    it("should be possible to redeem", async () => {
      await expect(
        allPairVault.connect(user1).redeem(quickMaticVaultId, 0, 0)
      ).to.be.revertedWith("Invalid caller");
      await allPairVault.connect(signer).redeem(quickMaticVaultId, 0, 0);
      await allPairVault.connect(signer).redeem(usdcUsdtVaultId, 0, 0);
    });
  });

  describe("Withdraw", () => {
    it("should be possible to withdraw", async () => {
      const balanceSrTokenquickMaticUser1 = await quick.balanceOf(
        user1.address
      );
      const balanceJrTokenquickMaticUser1 = await wMatic.balanceOf(
        user1.address
      );
      const balanceSrTokenusdcUsdtUser2 = await usdt.balanceOf(user2.address);
      const balanceJrTokenusdcUsdtUser2 = await usdc.balanceOf(user2.address);

      await allPairVault.connect(user1).withdraw(quickMaticVaultId, srId);
      await allPairVault.connect(user1).withdraw(quickMaticVaultId, jrId);
      await allPairVault.connect(user2).withdraw(usdcUsdtVaultId, srId);
      await allPairVault.connect(user2).withdraw(usdcUsdtVaultId, jrId);

      const withdrawSrTokenquickMaticUser1 = (
        await quick.balanceOf(user1.address)
      ).sub(balanceSrTokenquickMaticUser1);
      const withdrawJrTokenquickMaticUser1 = (
        await wMatic.balanceOf(user1.address)
      ).sub(balanceJrTokenquickMaticUser1);
      const withdrawSrTokenusdcUsdtUser2 = (
        await usdt.balanceOf(user2.address)
      ).sub(balanceSrTokenusdcUsdtUser2);
      const withdrawJrTokenusdcUsdtUser2 = (
        await usdc.balanceOf(user2.address)
      ).sub(balanceJrTokenusdcUsdtUser2);
    });
  });
});
