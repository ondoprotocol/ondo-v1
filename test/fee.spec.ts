import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { createVault } from "../scripts/utils/helpers";
import {
  AllPairVault,
  Registry,
  SampleFeeCollector,
  SampleFeeCollector__factory,
  UniswapStrategy,
} from "../typechain";
import { addresses } from "./utils/addresses";
import * as get from "./utils/getters";
import { UniPoolMock } from "./utils/uni";
import { UnilikeFixture, UnilikeVault } from "./utils/vault";

use(solidity);

const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const { provider } = ethers;
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("Performance fees", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let feeCollector: SampleFeeCollector;
  let strategy: UniswapStrategy;
  let pool: UniPoolMock;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let unilike: UnilikeVault;
  let trancheTokenImpl: string;
  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    const signer = signers[0];
    await deployments.fixture("UniswapStrategy");
    const feeCollectorFactory = new SampleFeeCollector__factory(signer);

    trancheTokenImpl = (await ethers.getContract("TrancheToken")).address;
    registry = await ethers.getContract("Registry");
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract("UniswapStrategy");
    await registry.enableTokens();
    UnilikeFixture.init(signers, signers[6], vault, trancheTokenImpl);
    feeCollector = await feeCollectorFactory.deploy(
      vault.address,
      registry.address
    );
  });
  function setup() {
    it("setup vault fixture", async function () {
      pool = await UniPoolMock.createMock(
        signers[0],
        addresses.uniswap.router,
        BigNumber.from(stre18),
        BigNumber.from(stre18)
      );
    });
    it("create vault", async function () {
      await UnilikeFixture.createVault(
        pool,
        strategy as any,
        hurdle,
        enrollment,
        duration,
        true
      );
      unilike = UnilikeFixture.unilike;
    });
  }
  // describe("setup fee contract and fee percent", async function () {
  //   setup();
  //   await vault.setPerformanceFeeCollector(feeCollector.address);
  //   await vault.setPerformanceFee(unilike.vaultId, BigNumber.from(10000));
  // });
  describe("delayed Vault", async function () {
    let delayedVaultId: BigNumber;
    let investAt: number;
    let redeemAt: number;
    const amountIn = BigNumber.from(10).pow(18);
    let startTime: number;
    setup();
    it("can only deposit after start time", async function () {
      startTime = (await provider.getBlock("latest")).timestamp + 30;
      await pool.mint("zero", amountIn.mul(2), accounts[0]);
      await pool.token0.approve(vault.address, amountIn.mul(2));
      const vaultParams = {
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime: startTime,
        enrollment: enrollment,
        duration: duration,
        seniorTrancheCap: amountIn,
        seniorUserCap: amountIn.mul(2),
        juniorTrancheCap: amountIn,
        juniorUserCap: amountIn,
      };
      // await strategy.setPathJuniorToSenior([
      //   vaultParams.juniorAsset,
      //   vaultParams.seniorAsset,
      // ]);
      // await strategy.setPathSeniorToJunior([
      //   vaultParams.seniorAsset,
      //   vaultParams.juniorAsset,
      // ]);
      ({ id: delayedVaultId, investAt, redeemAt } = await createVault(
        vault,
        vaultParams
      ));
      await provider.send("evm_mine", []);
    });
    it("setup fee collector and performance fee", async function () {
      await vault.setPerformanceFeeCollector(feeCollector.address);
      await vault.setPerformanceFee(delayedVaultId, BigNumber.from(500));
    });
    it("deposits after start time", async function () {
      await provider.send("evm_mine", [startTime + 1]);
      await vault.deposit(delayedVaultId, 0, amountIn);
      expect(await get.seniorDeposited(vault, delayedVaultId)).equal(amountIn);
      await pool.mint("one", amountIn.mul(2), accounts[1]);
      await pool.token1
        .connect(signers[1])
        .approve(vault.address, amountIn.mul(2));
      await vault.connect(signers[1]).deposit(delayedVaultId, 1, amountIn);
    });
    it("invest and redeem", async function () {
      let balance = await pool.balancesOf(signers[0].address);
      await provider.send("evm_mine", [investAt]);
      await vault.connect(signers[0]).invest(delayedVaultId, 0, 0);

      // Admittedly, I don't know how this will effect the gains for
      // the junio tranche. But I used console.log in the contracts to
      // manually check that the fee was taken from the junior
      // tranche.
      // TODO: Put that check here where it belongs!

      await pool.addReserves(e18.mul(500).toFixed(0), e18.mul(500).toFixed(0));
      await provider.send("evm_mine", [redeemAt]);
      await vault.connect(signers[0]).redeem(delayedVaultId, 0, 0);
      balance = await pool.balancesOf(signers[0].address);
    });
  });
});
