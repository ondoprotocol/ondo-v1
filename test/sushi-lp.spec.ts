import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { BigNumber, BigNumberish } from "ethers";
import hre, { deployments, ethers } from "hardhat";
import _ from "lodash";
import * as helpers from "../scripts/utils/helpers";
import {
  AllPairVault,
  ERC20Mock,
  ERC20Mock__factory,
  IMasterChef,
  IUniswapV2Router02,
  Registry,
  SushiStrategyLP,
  TrancheToken,
} from "../typechain";
import { ForceSend__factory } from "../typechain/factories/ForceSend__factory";
import { ForceSend } from "../typechain/ForceSend";
import { addresses } from "./utils/addresses";
import * as get from "./utils/getters";
import { sushiRouterAddr, UniPoolMock } from "./utils/uni";
use(solidity);

const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const { provider } = ethers;

const chefAddr = "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd";
const sushiAddr = "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2";
const sushiFactory = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

let testsToRun = [
  "sell senior for leveraged junior returns",
  "sell all junior to partially cover senior",
  "sell some junior to cover senior",
];

describe("SushiStrategyLP", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: SushiStrategyLP;
  let srId = 0;
  let jrId = 1;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let router: IUniswapV2Router02;
  let chef: IMasterChef;
  let srERC20s: TrancheToken[] = [];
  let jrERC20s: TrancheToken[] = [];
  let poolId: number;
  let pool: UniPoolMock;
  let srSushiPool: UniPoolMock;
  let sushi: ERC20Mock;
  let chefAsSigner: SignerWithAddress;
  let forceSend: ForceSend;
  let amountIn: BigNumberish;
  let vaultIds: BigNumber[] = [];
  let erc20MockFactory: ERC20Mock__factory;
  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    await deployments.fixture("SushiswapStrategy");
    const forceSendFactory = new ForceSend__factory(signers[0]);
    forceSend = await forceSendFactory.deploy();
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [chefAddr],
    });
    chefAsSigner = await ethers.getSigner(chefAddr);
    erc20MockFactory = new ERC20Mock__factory(chefAsSigner);
    sushi = await ethers.getContractAt("ERC20Mock", sushiAddr, chefAsSigner);
    await forceSend.forceSend(chefAddr, { value: stre18 });

    registry = await ethers.getContract("Registry");
    await registry.enableTokens();
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract("SushiStrategyLP");

    chef = await ethers.getContractAt("IMasterChef", chefAddr, signers[0]);
    const chefOwner = await chef.owner();
    await forceSend.forceSend(chefOwner, { value: stre18 });
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [chefOwner],
    });
    chef = chef.connect(await ethers.provider.getSigner(chefOwner));
    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      sushiRouterAddr,
      signers[0]
    );
    await registry.enableTokens();
  });
  it("pool add and update reverts", async function () {
    await expect(
      strategy.addPool("0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f", 1, [
        sushiAddr,
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        addresses.zero,
      ])
    ).revertedWith("Pool ID does not match pool");
    await expect(
      strategy.addPool("0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f", 1, [
        sushiAddr,
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        addresses.zero,
      ])
    ).revertedWith("Pool ID does not match pool");
    // TODO: add back test for "Not a valid path for pool"
    // await strategy.addPool("0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f", 1, [
    //   sushiAddr,
    //   "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    //   "0x6b175474e89094c44da98b954eedeac495271d0f",
    // ]);
    // await expect(
    //   strategy.addPool("0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f", 1, [
    //     sushiAddr,
    //     "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    //     "0x6b175474e89094c44da98b954eedeac495271d0f",
    //   ])
    // ).revertedWith("Pool ID already registered");
    // await strategy.updatePool("0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f", [
    //   sushiAddr,
    //   "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    //   "0x6b175474e89094c44da98b954eedeac495271d0f",
    // ]);
    await expect(
      strategy
        .connect(signers[1])
        .updatePool("0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f", [
          "0x795065dCc9f64b5614C407a6EFDC400DA6221FB0",
          "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          "0x6b175474e89094c44da98b954eedeac495271d0f",
        ])
    ).revertedWith("Unauthorized");
    await expect(
      strategy.updatePool("0x" + "0".repeat(39) + "1", [
        addresses.zero,
        addresses.zero,
      ])
    ).revertedWith("Pool ID not yet registered");
    pool = await UniPoolMock.createMock(
      chefAsSigner,
      sushiRouterAddr,
      stre18,
      stre18
    );
    srSushiPool = await UniPoolMock.connectMock(
      chefAsSigner,
      sushiRouterAddr,
      sushi,
      pool.token0,
      stre18,
      stre18
    );
    poolId = await chef.poolLength().then((x) => x.toNumber());
    await chef.add(
      await chef
        .totalAllocPoint()
        .then((x) => new Decimal(x.toString()).mul(0.00001).toFixed(0)),
      pool.pool.address,
      false
    );
    await strategy.addPool(pool.pool.address, poolId, [pool.token0.address]);
    await expect(
      strategy.addPool(pool.pool.address, poolId, [pool.token0.address])
    ).revertedWith("Pool ID already registered");
    await strategy.updatePool(pool.pool.address, [pool.token0.address]);
    await setup(3);
  });
  async function setup(allocPointRatio: string | number) {
    await chef.set(
      poolId,
      await chef
        .totalAllocPoint()
        .then((x) => new Decimal(x.toString()).mul(allocPointRatio).toFixed(0)),
      false
    );
    router = pool.router;
  }
  function createVault(testIndex: number) {
    it(`create Vault: ${testsToRun[testIndex]}`, async function () {
      const startTime = (await provider.getBlock("latest")).timestamp + 3;
      const vaultParams = {
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime: startTime,
        enrollment: enrollment,
        duration: duration,
      };
      let investAt;
      let redeemAt;
      let vaultId;
      ({ id: vaultId, investAt, redeemAt } = await helpers.createVault(
        vault,
        vaultParams
      ));
      await provider.send("evm_mine", [startTime]);
      vaultIds.push(vaultId);
      const vaultObj = await vault.getVaultById(vaultId);
      const srERC20: TrancheToken = await ethers.getContractAt(
        "TrancheToken",
        vaultObj.assets[0].trancheToken,
        signers[0]
      );
      const jrERC20: TrancheToken = await ethers.getContractAt(
        "TrancheToken",
        vaultObj.assets[1].trancheToken,
        signers[1]
      );
      srERC20s.push(srERC20);
      jrERC20s.push(jrERC20);
      const srTokenVault = await vault.VaultsByTokens(srERC20.address);
      const jrTokenVault = await vault.VaultsByTokens(jrERC20.address);
      expect(srTokenVault).equal(vaultId);
      expect(jrTokenVault).equal(vaultId);
      expect(await srERC20.vaultId()).equal(vaultId);
      expect(await jrERC20.vaultId()).equal(vaultId);
      expect(await srERC20.vault()).equal(vault.address);
      expect(await jrERC20.vault()).equal(vault.address);
      expect(await srERC20.symbol()).equal("SR");
      expect(await jrERC20.symbol()).equal("JR");
    });
  }
  function deposit(testIndex: number) {
    it(`deposit senior asset: ${testsToRun[testIndex]}`, async function () {
      const vaultId = vaultIds[testIndex];
      const srERC20 = srERC20s[testIndex];
      const jrERC20 = jrERC20s[testIndex];
      amountIn = e18.times(3).toFixed();

      await pool.mint("zero", amountIn, accounts[0]);
      await pool.mint("zero", amountIn, accounts[1]);
      await pool.token0.connect(signers[0]).approve(vault.address, amountIn);
      await pool.token0.connect(signers[1]).approve(vault.address, amountIn);
      await vault.connect(signers[0]).deposit(vaultId, srId, amountIn);
      await vault.connect(signers[1]).deposit(vaultId, srId, amountIn);
    });
    it(`deposit junior asset: ${testsToRun[testIndex]}`, async function () {
      const vaultId = vaultIds[testIndex];
      const srERC20 = srERC20s[testIndex];
      const jrERC20 = jrERC20s[testIndex];
      amountIn = e18.times(3).toFixed();
      await pool.mint("one", amountIn, accounts[2]);
      await pool.mint("one", amountIn, accounts[3]);
      await pool.token1.connect(signers[2]).approve(vault.address, amountIn);
      await pool.token1.connect(signers[3]).approve(vault.address, amountIn);
      await vault.connect(signers[2]).deposit(vaultId, jrId, amountIn);
      await vault.connect(signers[3]).deposit(vaultId, jrId, amountIn);
    });
  }
  function depositLP(signerIndex: number, testIndex: number) {
    it(`deposit LP tokens mid-duration with signer ${signerIndex}: ${testsToRun[testIndex]}`, async function () {
      const vaultId = vaultIds[testIndex];
      const srERC20 = srERC20s[testIndex];
      const jrERC20 = jrERC20s[testIndex];
      const signer = signers[signerIndex];
      const poolData = await strategy.pools(pool.pool.address);
      const sharesBefore = await strategy
        .vaults(vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const lpBefore = sharesBefore
        .times(poolData.totalLp.toString())
        .div(poolData.totalShares.toString());
      const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
        srERC20.balanceOf(signer.address),
        jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));
      const vaultData = await vault.getVaultById(vaultId);
      const seniorTotalBefore = new Decimal(
        vaultData.assets[0].totalInvested.toString()
      );
      const juniorTotalBefore = new Decimal(
        vaultData.assets[1].totalInvested.toString()
      );

      const amountIn = e18.toFixed();
      const lp = await pool
        .mintAndAdd(amountIn, amountIn, signer.address)
        .then((lp) => new Decimal(lp.toString()));
      const shares = lp
        .times(poolData.totalShares.toString())
        .div(poolData.totalLp.toString());
      await pool.pool.connect(signer).approve(vault.address, lp.toFixed());
      await vault.connect(signer).depositLp(vaultId, lp.toFixed(0));
      const sharesAfter = await strategy
        .vaults(vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const lpAfter = sharesAfter
        .times(poolData.totalLp.toString())
        .div(poolData.totalShares.toString());
      expect(lpAfter.sub(lpBefore.add(lp.toString())).abs().lt(1000)).eq(true);
      expect(
        sharesAfter.sub(sharesBefore.add(shares.toString())).abs().lt(1000)
      ).eq(true);
      const seniorExpected = shares
        .mul(seniorTotalBefore.toString())
        .div(sharesBefore.toString());

      const juniorExpected = shares
        .mul(juniorTotalBefore.toString())
        .div(sharesBefore.toString());

      const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
        srERC20.balanceOf(signer.address),
        jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));
      expect(
        seniorBalanceAfter
          .sub(seniorBalanceBefore.add(seniorExpected))
          .abs()
          .lt(1000)
      ).eq(true);
      expect(
        juniorBalanceAfter
          .sub(juniorBalanceBefore.add(juniorExpected))
          .abs()
          .lt(1000)
      ).eq(true);
    });
  }
  function withdrawLP(signerIndex: number, testIndex: number) {
    it(`withdraw LP mid-duration with signer ${signerIndex}: ${testsToRun[testIndex]}`, async function () {
      const vaultId = vaultIds[testIndex];
      const srERC20 = srERC20s[testIndex];
      const jrERC20 = jrERC20s[testIndex];
      const signer = signers[signerIndex];
      const poolData = await strategy.pools(pool.pool.address);
      const sharesBefore = await strategy
        .vaults(vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const lpBefore = sharesBefore
        .times(poolData.totalLp.toString())
        .div(poolData.totalShares.toString());
      const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
        srERC20.balanceOf(signer.address),
        jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));
      const vaultData = await vault.getVaultById(vaultId);

      const seniorTotalBefore = new Decimal(
        vaultData.assets[0].totalInvested.toString()
      );
      const juniorTotalBefore = new Decimal(
        vaultData.assets[1].totalInvested.toString()
      );

      const stratVaultData = await strategy.vaults(vaultId);

      const sharesToWithdraw = seniorBalanceBefore
        .mul(stratVaultData.shares.toString())
        .div(seniorTotalBefore);

      const lpToWithdraw = sharesToWithdraw
        .times(poolData.totalLp.toString())
        .div(poolData.totalShares.toString());

      await vault
        .connect(signer)
        .withdrawLp(vaultId, sharesToWithdraw.toFixed(0));

      const sharesAfter = await strategy
        .vaults(vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const lpAfter = sharesAfter
        .times(poolData.totalLp.toString())
        .div(poolData.totalShares.toString());
      const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
        srERC20.balanceOf(signer.address),
        jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));

      const seniorToBurn = sharesToWithdraw
        .div(sharesBefore)
        .mul(seniorTotalBefore);
      const juniorToBurn = sharesToWithdraw
        .div(sharesBefore)
        .mul(juniorTotalBefore);

      expect(lpAfter.sub(lpBefore.sub(lpToWithdraw)).abs().lt(1000)).eq(true);
      expect(
        seniorBalanceAfter
          .sub(seniorBalanceBefore.sub(seniorToBurn))
          .abs()
          .lt(1000)
      ).eq(true);
      expect(
        juniorBalanceAfter
          .sub(juniorBalanceBefore.sub(juniorToBurn))
          .abs()
          .lt(1000)
      ).eq(true);
    });
  }
  function claim(testIndex: number) {
    it(`claim tranche tokens: ${testsToRun[testIndex]}`, async function () {
      const vaultId = vaultIds[testIndex];
      const srERC20 = srERC20s[testIndex];
      const jrERC20 = jrERC20s[testIndex];
      await vault.connect(signers[0]).claim(vaultId, 0);
      await vault.connect(signers[1]).claim(vaultId, 0);
      const acct0Bal = await srERC20.balanceOf(accounts[0]);
      const acct1Bal = await srERC20.balanceOf(accounts[1]);
      await vault.connect(signers[2]).claim(vaultId, 1);
      await vault.connect(signers[3]).claim(vaultId, 1);
      const acct2Bal = await jrERC20.balanceOf(accounts[2]);
      const acct3Bal = await jrERC20.balanceOf(accounts[3]);
      // expect(acct3Bal.toString()).equal(amountIn);
      // expect(acct2Bal.toString()).equal(amountIn);
      // expect(acct0Bal.toString()).to.equal(amountIn);
      // expect(acct1Bal.toString()).to.equal(amountIn);
    });
  }
  function invest(testIndex: number) {
    it(`invest assets: ${testsToRun[testIndex]}`, async function () {
      const vaultId = vaultIds[testIndex];
      const srERC20 = srERC20s[testIndex];
      const jrERC20 = jrERC20s[testIndex];
      await vault.invest(vaultId, 0, 0);
      const seniorInvested = await get.seniorInvested(vault, vaultId);
      const juniorInvested = await get.juniorInvested(vault, vaultId);
      // expect(juniorInvested.toString()).equal(e18.times(6).toFixed(0));
      // expect(seniorInvested.toString()).equal(e18.times(6).toFixed(0));
    });
  }
  function harvest(testIndex: number) {
    it(`harvest rewards: ${testsToRun[testIndex]}`, async function () {
      const vaultId = vaultIds[testIndex];
      const srERC20 = srERC20s[testIndex];
      const jrERC20 = jrERC20s[testIndex];
      await expect(
        strategy.connect(signers[1]).harvest(pool.pool.address, 0)
      ).revertedWith("Unauthorized");
      await strategy.harvest(pool.pool.address, 0);
    });
  }
  function batchCreate() {
    describe("batchCreate", function () {
      for (let i = 0; i < testsToRun.length; i++) {
        createVault(i);
      }
    });
  }
  function batchDeposit() {
    describe("batchDeposit", function () {
      for (let i = 0; i < testsToRun.length; i++) {
        deposit(i);
      }
    });
  }
  function batchInvest() {
    describe("batchInvest", function () {
      for (let i = 0; i < testsToRun.length; i++) {
        invest(i);
      }
    });
  }
  function batchMidDeposit(signerIndices: number[]) {
    describe("batchMidDeposit", function () {
      for (let i = 0; i < testsToRun.length; i++) {
        for (const j of signerIndices) {
          depositLP(j, i);
        }
      }
    });
  }
  function batchMidWithdraw(signerIndices: number[]) {
    describe("batchMidWithdraw", function () {
      for (let i = 0; i < testsToRun.length; i++) {
        for (const j of signerIndices) {
          withdrawLP(j, i);
        }
      }
    });
  }
  function batchHarvest() {
    describe("batchHarvest", function () {
      for (let i = 0; i < testsToRun.length; i++) {
        harvest(i);
      }
    });
  }
  function batchClaim() {
    describe("batchClaim", function () {
      for (let i = 0; i < testsToRun.length; i++) {
        claim(i);
      }
    });
  }
  function increaseTime(time: number) {
    describe("increase time", function () {
      it("increase time", async function () {
        await provider.send("evm_increaseTime", [Math.floor(time)]);
      });
    });
  }
  batchCreate();
  batchDeposit();
  increaseTime(enrollment + 1);
  batchInvest();
  increaseTime(duration / 4);
  batchMidDeposit([4]);
  batchMidDeposit([5]);
  increaseTime(duration / 4);
  batchHarvest();
  batchMidWithdraw([4]);
  batchMidDeposit([6]);
  batchHarvest();
  increaseTime(duration / 2 + 5);
  batchClaim();
  describe("redeem and withdrawal: sell senior for leveraged junior returns", function () {
    let vaultId: BigNumber;
    let srERC20: TrancheToken;
    let jrERC20: TrancheToken;
    before(function () {
      vaultId = vaultIds.shift()!;
      srERC20 = srERC20s.shift()!;
      jrERC20 = jrERC20s.shift()!;
    });
    it("redeem LP after fee accrual", async function () {
      await pool.addReserves(stre18, stre18);
      const reservesBefore = await pool
        .balancesOf(pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));

      await vault.redeem(vaultId, 0, 0).then((tx) => tx.wait(1));
      const seniorReceived = await get.seniorReceived(vault, vaultId);
      const seniorExpected = new Decimal(
        (await get.seniorInvested(vault, vaultId)).toString()
      ).times(1.1);
      const juniorReceived = await get.juniorReceived(vault, vaultId);

      const reservesAfter = await pool
        .balancesOf(pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString()))); // check that senior and sushi both sold for jr
      expect(seniorExpected.minus(seniorReceived.toString()).abs().lt(1000)).eq(
        true
      );
      expect(juniorReceived.gt(0)).eq(true);
      expect(
        reservesAfter[0]
          .div(reservesAfter[1])
          .gt(reservesBefore[0].div(reservesBefore[1]))
      ).eq(true);
    });
    it("withdraw received amounts", async function () {
      // n.b. signers[4] has one left over in this case anomolously
      const srSigners = [signers[0], signers[1], signers[5], signers[6]];
      const jrSigners = [signers[2], signers[3], signers[5], signers[6]];
      const srBefore = await Promise.all(
        srSigners.map((s) => pool.token0.balanceOf(s.address))
      );
      const jrBefore = await Promise.all(
        jrSigners.map((s) => pool.token1.balanceOf(s.address))
      );
      await Promise.all(
        srSigners
          .concat([signers[4]])
          .map((s) => vault.connect(s).withdraw(vaultId, srId))
      );
      await Promise.all(
        jrSigners
          .concat([signers[4]])
          .map((s) => vault.connect(s).withdraw(vaultId, jrId))
      );
      const srAfter = await Promise.all(
        srSigners.map((s) => pool.token0.balanceOf(s.address))
      );
      const jrAfter = await Promise.all(
        jrSigners.map((s) => pool.token1.balanceOf(s.address))
      );
      const srTranche = await Promise.all(
        srSigners.map((s) => srERC20.balanceOf(s.address))
      );
      const jrTranche = await Promise.all(
        jrSigners.map((s) => jrERC20.balanceOf(s.address))
      );
      expect(srTranche.every((x) => x.eq(0)));
      expect(jrTranche.every((x) => x.eq(0)));
      expect(_.zip(srAfter, srBefore).every(([a, b]) => a!.sub(b!).gt(0))).eq(
        true
      );
      expect(_.zip(jrAfter, jrBefore).every(([a, b]) => a!.sub(b!).gt(0))).eq(
        true
      );
      expect(await srERC20.totalSupply()).eq(0);
      expect(await jrERC20.totalSupply()).eq(0);
      const vaultData = await strategy.vaults(vaultId);
      expect(vaultData.shares).eq(0);
    });
  });
  describe("redeem and withdrawal: sell all junior to partially cover senior", function () {
    let vaultId: BigNumber;
    let srERC20: TrancheToken;
    let jrERC20: TrancheToken;
    before(function () {
      vaultId = vaultIds.shift()!;
      srERC20 = srERC20s.shift()!;
      jrERC20 = jrERC20s.shift()!;
    });
    it("redeem LP after fee accrual", async function () {
      const fe17 = BigNumber.from(10).pow(17);
      await pool.removeReserves(
        await pool.token0
          .balanceOf(pool.pool.address)
          .then((x) => new Decimal(x.toString()).mul(0.8).toFixed(0)),
        fe17
      );
      const reservesBefore = await pool
        .balancesOf(pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      await vault.redeem(vaultId, 0, 0);
      const seniorReceived = await get.seniorReceived(vault, vaultId);
      const seniorExpected = new Decimal(
        (await get.seniorInvested(vault, vaultId)).toString()
      )
        .times(1.1)
        .toFixed(0);
      const juniorReceived = await get.juniorReceived(vault, vaultId);
      const reservesAfter = await pool
        .balancesOf(pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      // check that junior was sold, and sushi sold for senior
      expect(seniorReceived.gt(0)).eq(true);
      expect(seniorReceived.lt(seniorExpected)).eq(true);
      expect(juniorReceived.eq(0)).eq(true);
      expect(
        reservesAfter[0]
          .div(reservesAfter[1])
          .lt(reservesBefore[0].div(reservesBefore[1]))
      ).eq(true);
    });
    it("withdraw received amounts", async function () {
      const srSigners = [signers[0], signers[1], signers[5], signers[6]];
      const jrSigners = [signers[2], signers[3], signers[5], signers[6]];
      const srBefore = await Promise.all(
        srSigners.map((s) => pool.token0.balanceOf(s.address))
      );
      const jrBefore = await Promise.all(
        jrSigners.map((s) => pool.token1.balanceOf(s.address))
      );
      await Promise.all(
        srSigners
          .concat([signers[4]])
          .map((s) => vault.connect(s).withdraw(vaultId, srId))
      );
      await Promise.all(
        jrSigners
          .concat([signers[4]])
          .map((s) => vault.connect(s).withdraw(vaultId, jrId))
      );
      const srAfter = await Promise.all(
        srSigners.map((s) => pool.token0.balanceOf(s.address))
      );
      const jrAfter = await Promise.all(
        jrSigners.map((s) => pool.token1.balanceOf(s.address))
      );
      const srTranche = await Promise.all(
        srSigners.map((s) => srERC20.balanceOf(s.address))
      );
      const jrTranche = await Promise.all(
        jrSigners.map((s) => jrERC20.balanceOf(s.address))
      );
      expect(srTranche.every((x) => x.eq(0)));
      expect(jrTranche.every((x) => x.eq(0)));
      expect(_.zip(srAfter, srBefore).every(([a, b]) => a!.sub(b!).gt(0))).eq(
        true
      );
      expect(_.zip(jrAfter, jrBefore).every(([a, b]) => a!.sub(b!).eq(0))).eq(
        true
      );
      expect(await srERC20.totalSupply()).eq(0);
      expect(await jrERC20.totalSupply()).eq(0);
      const vaultData = await strategy.vaults(vaultId);
      expect(vaultData.shares).eq(0);
    });
  });
  describe("redeem and withdrawal: sell some junior to cover ", function () {
    let vaultId: BigNumber;
    let srERC20: TrancheToken;
    let jrERC20: TrancheToken;
    before(function () {
      vaultId = vaultIds.shift()!;
      srERC20 = srERC20s.shift()!;
      jrERC20 = jrERC20s.shift()!;
    });
    it("redeem LP after fee accrual", async function () {
      await pool.addReserves(
        BigNumber.from(10).pow(18).mul(12),
        BigNumber.from(10).pow(18).mul(4)
      );
      const reservesBefore = await pool
        .balancesOf(pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      await vault.redeem(vaultId, 0, 0);
      const seniorReceived = await get.seniorReceived(vault, vaultId);
      const seniorExpected = new Decimal(
        (await get.seniorInvested(vault, vaultId)).toString()
      ).times(1.1);
      const juniorReceived = await get.juniorReceived(vault, vaultId);
      const reservesAfter = await pool
        .balancesOf(pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));

      expect(seniorExpected.minus(seniorReceived.toString()).abs().lt(1000)).eq(
        true
      );
      expect(juniorReceived.gt(0)).eq(true);
      expect(
        reservesAfter[0]
          .div(reservesAfter[1])
          .lt(reservesBefore[0].div(reservesBefore[1]))
      ).eq(true);
    });
    it("withdraw received amounts", async function () {
      const srSigners = [signers[0], signers[1], signers[5], signers[6]];
      const jrSigners = [signers[2], signers[3], signers[5], signers[6]];
      const srBefore = await Promise.all(
        srSigners.map((s) => pool.token0.balanceOf(s.address))
      );
      const jrBefore = await Promise.all(
        jrSigners.map((s) => pool.token1.balanceOf(s.address))
      );
      await Promise.all(
        srSigners
          .concat([signers[4]])
          .map((s) => vault.connect(s).withdraw(vaultId, srId))
      );
      await Promise.all(
        jrSigners
          .concat([signers[4]])
          .map((s) => vault.connect(s).withdraw(vaultId, jrId))
      );
      const srAfter = await Promise.all(
        srSigners.map((s) => pool.token0.balanceOf(s.address))
      );
      const jrAfter = await Promise.all(
        jrSigners.map((s) => pool.token1.balanceOf(s.address))
      );
      const srTranche = await Promise.all(
        srSigners.map((s) => srERC20.balanceOf(s.address))
      );
      const jrTranche = await Promise.all(
        jrSigners.map((s) => jrERC20.balanceOf(s.address))
      );
      expect(srTranche.every((x) => x.eq(0)));
      expect(jrTranche.every((x) => x.eq(0)));
      expect(_.zip(srAfter, srBefore).every(([a, b]) => a!.sub(b!).gt(0))).eq(
        true
      );
      expect(_.zip(jrAfter, jrBefore).every(([a, b]) => a!.sub(b!).gt(0))).eq(
        true
      );
      expect(await srERC20.totalSupply()).eq(0);
      expect(await jrERC20.totalSupply()).eq(0);
      const vaultData = await strategy.vaults(vaultId);
      expect(vaultData.shares).eq(0);
    });
  });
  describe("final sanity check", function () {
    it("pool totallp and totalshares is zero", async function () {
      const poolData = await strategy.pools(pool.pool.address);
      expect(poolData.totalShares).eq(0);
      expect(poolData.totalLp).eq(0);
    });
  });
  // what i do with this testing framework is an abomination
  // we need to create a more general vault testing framework
  describe("works with sushi as token in pair being farmed", async function () {
    before(async function () {
      vaultIds = [];
      testsToRun = ["pair with sushi as token in pair"];
      const otherToken = await erc20MockFactory.deploy();
      pool = await UniPoolMock.connectMock(
        chefAsSigner,
        sushiRouterAddr,
        sushi,
        otherToken,
        stre18,
        stre18
      );
      poolId = await chef.poolLength().then((x) => x.toNumber());
      await chef.add(
        await chef
          .totalAllocPoint()
          .then((x) => new Decimal(x.toString()).mul(0.00001).toFixed(0)),
        pool.pool.address,
        false
      );
      await strategy.addPool(pool.pool.address, poolId, []);
      await setup(3);
    });
    batchCreate();
    batchDeposit();
    increaseTime(enrollment + 1);
    batchInvest();
    increaseTime(duration / 4);
    batchMidDeposit([4]);
    batchMidDeposit([5]);
    increaseTime(duration / 4);
    batchHarvest();
    batchMidWithdraw([4]);
    batchMidDeposit([6]);
    batchHarvest();
    increaseTime(duration / 2 + 5);
    batchClaim();
    describe("redeem and withdraw", async function () {
      let vaultId: BigNumber;
      let srERC20: TrancheToken;
      let jrERC20: TrancheToken;
      before(function () {
        vaultId = vaultIds.shift()!;
        srERC20 = srERC20s.shift()!;
        jrERC20 = jrERC20s.shift()!;
      });
      it("redeem LP after fee accrual", async function () {
        await pool.addReserves(
          BigNumber.from(10).pow(18).mul(12),
          BigNumber.from(10).pow(18).mul(4)
        );

        await vault.redeem(vaultId, 0, 0);
        const srSigners = [signers[0], signers[1], signers[5], signers[6]];
        const jrSigners = [signers[2], signers[3], signers[5], signers[6]];
        const srBefore = await Promise.all(
          srSigners.map((s) => pool.token0.balanceOf(s.address))
        );
        const jrBefore = await Promise.all(
          jrSigners.map((s) => pool.token1.balanceOf(s.address))
        );
        await Promise.all(
          srSigners
            .concat([signers[4]])
            .map((s) => vault.connect(s).withdraw(vaultId, srId))
        );
        await Promise.all(
          jrSigners
            .concat([signers[4]])
            .map((s) => vault.connect(s).withdraw(vaultId, jrId))
        );
        const srAfter = await Promise.all(
          srSigners.map((s) => pool.token0.balanceOf(s.address))
        );
        const jrAfter = await Promise.all(
          jrSigners.map((s) => pool.token1.balanceOf(s.address))
        );
        const srTranche = await Promise.all(
          srSigners.map((s) => srERC20.balanceOf(s.address))
        );
        const jrTranche = await Promise.all(
          jrSigners.map((s) => jrERC20.balanceOf(s.address))
        );
        expect(srTranche.every((x) => x.eq(0)));
        expect(jrTranche.every((x) => x.eq(0)));
        expect(_.zip(srAfter, srBefore).every(([a, b]) => a!.sub(b!).gt(0))).eq(
          true
        );
        expect(_.zip(jrAfter, jrBefore).every(([a, b]) => a!.sub(b!).gt(0))).eq(
          true
        );
        expect(await srERC20.totalSupply()).eq(0);
        expect(await jrERC20.totalSupply()).eq(0);
        const vaultData = await strategy.vaults(vaultId);
        expect(vaultData.shares).eq(0);
      });
    });
  });
});
