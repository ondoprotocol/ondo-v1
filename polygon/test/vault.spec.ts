import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { createVault, getStrategyName } from "./utils/helpers";
import { AllPairVault, Registry, UniswapStrategy } from "../../typechain";
import { getAmmAddresses } from "./utils/addresses";
import * as get from "../../test/utils/getters";
import { UniPoolMock } from "./utils/uni";
import { UnilikeFixture, UnilikeVault } from "../../test/utils/vault";

use(solidity);

const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const { provider } = ethers;
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("AllPairVault", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let pool: UniPoolMock;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let unilike: UnilikeVault;
  let trancheTokenImpl: string;
  let router: string;
  let strategyName: string;

  strategyName = getStrategyName();

  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);

    await deployments.fixture(strategyName);

    trancheTokenImpl = (await ethers.getContract("TrancheToken")).address;
    registry = await ethers.getContract("Registry");
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract(strategyName);

    UnilikeFixture.init(signers, signers[6], vault, trancheTokenImpl);
  });
  function setup() {
    it("setup vault fixture", async function () {
      router = getAmmAddresses().router;
      pool = await UniPoolMock.createMock(
        signers[0],
        router,
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
        duration
      );
      unilike = UnilikeFixture.unilike;
    });
  }
  function testTokenSetting() {
    it("can't deposit or withdraw midterm unless tranche tokens are enabled", async function () {
      await expect(
        vault.connect(signers[7]).depositLp(unilike.vaultId, stre18)
      ).revertedWith("Vault tokens inactive");
      await registry.enableTokens();
    });
  }
  describe("delayed Vault", async function () {
    let delayedVaultId: BigNumber;
    let investAt: number;
    const amountIn = BigNumber.from(10).pow(18);
    setup();
    it("can only deposit after start time", async function () {
      const startTime = (await provider.getBlock("latest")).timestamp + 30;
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

      ({ id: delayedVaultId, investAt } = await createVault(
        vault,
        vaultParams
      ));

      await provider.send("evm_mine", []);
      await expect(vault.deposit(delayedVaultId, 0, amountIn)).revertedWith(
        "Not time yet"
      );
      await provider.send("evm_mine", [startTime + 1]);
    });

    it("can get multiple vaults back from getVault", async function () {
      const startTime = (await provider.getBlock("latest")).timestamp + 30;
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

      const vaultParams2 = {
        ...vaultParams,
        seniorAsset: pool.token1.address,
        juniorAsset: pool.token0.address,
      };

      const vaultParams3 = {
        ...vaultParams,
        seniorAsset: pool.token1.address,
        juniorAsset: pool.token0.address,
        hurdleRate: hurdle + 20, // to get a unique id
      };

      await createVault(vault, vaultParams);
      await createVault(vault, vaultParams2);
      await createVault(vault, vaultParams3);

      const first = await vault.getVaults(0, 2);
      const second = await vault.getVaults(1, 2);
      const third = await vault.getVaults(2, 2);

      expect(first.length).to.equal(3);
      expect(second.length).to.equal(2);
      expect(third.length).to.equal(1);
    });
    it("deposits after start time", async function () {
      await vault.deposit(delayedVaultId, 0, amountIn);
      expect(await get.seniorDeposited(vault, delayedVaultId)).equal(amountIn);
      await pool.mint("one", amountIn.mul(2), accounts[1]);
      await pool.token1
        .connect(signers[1])
        .approve(vault.address, amountIn.mul(2));
      await vault.connect(signers[1]).deposit(delayedVaultId, 1, amountIn);
    });
    it("deposits exceed user cap", async function () {
      await expect(
        vault.connect(signers[1]).deposit(delayedVaultId, 1, BigNumber.from(1))
      ).revertedWith("Exceeds user cap");
    });
    it("deposits exceed tranche cap", async function () {
      await pool.mint("one", amountIn, accounts[0]);
      await pool.token1.connect(signers[0]).approve(vault.address, amountIn);
      await vault.deposit(delayedVaultId, 1, amountIn); // This should exceed tranche cap

      await provider.send("evm_mine", [investAt]);
      await vault.connect(signers[0]).invest(delayedVaultId, 0, 0);

      expect(await get.juniorTotalInvested(vault, delayedVaultId)).equal(
        amountIn
      );
    });
    it("can't deposit after investment", async function () {
      await pool.mint("one", amountIn, accounts[6]);
      await expect(
        vault.connect(signers[6]).deposit(delayedVaultId, 1, amountIn)
      ).revertedWith("Invalid operation");
    });
  });
  describe("withdraw midterm LP deposit", async function () {
    setup();
    UnilikeFixture.deposit();
    UnilikeFixture.invest();
    testTokenSetting();
    UnilikeFixture.depositLP(7);
    it("withdraws as expected after depositing LP without claiming", async function () {
      await pool.addReserves(e18.mul(500).toFixed(0), e18.mul(500).toFixed(0));
      await provider.send("evm_increaseTime", [duration / 2 + 1]);
      await UnilikeFixture.redeem();
      await vault.connect(signers[7]).withdraw(unilike.vaultId, 0);
      await vault.connect(signers[7]).withdraw(unilike.vaultId, 1);
      expect(await unilike.srERC20.balanceOf(accounts[7])).equal(0);
      expect(await unilike.jrERC20.balanceOf(accounts[7])).equal(0);
      const seniorWithdrawn = await pool.token0.balanceOf(accounts[7]);
      const juniorWithdrawn = await pool.token1.balanceOf(accounts[7]);
      expect(seniorWithdrawn).eq(
        BigNumber.from(new Decimal(1e18).times(hurdle).div(10000).toFixed(0))
      );
      expect(juniorWithdrawn).gt(BigNumber.from(10).pow(18));
    });
    UnilikeFixture.withdraw();
  });
  describe("sell senior for leveraged junior returns", function () {
    setup();
    UnilikeFixture.deposit();
    UnilikeFixture.getters();
    UnilikeFixture.invest();
    UnilikeFixture.claim();
    UnilikeFixture.withdrawLPFromOriginalDeposit();
    UnilikeFixture.depositLP(6);
    UnilikeFixture.depositLP(7);
    UnilikeFixture.withdrawLP(6);
    UnilikeFixture.withdrawLP(7);
    UnilikeFixture.redeemSellSeniorExcess();
    UnilikeFixture.withdraw();
  });
  describe("sell all junior to partially cover senior", function () {
    setup();
    UnilikeFixture.deposit();
    UnilikeFixture.invest();
    UnilikeFixture.claim();
    UnilikeFixture.withdrawLPFromOriginalDeposit();
    UnilikeFixture.depositLP(6);
    UnilikeFixture.depositLP(7);
    UnilikeFixture.withdrawLP(6);
    UnilikeFixture.withdrawLP(7);
    UnilikeFixture.redeemSellAllJr();
    UnilikeFixture.withdraw();
  });
  describe("sell some junior to cover senior", function () {
    setup();
    UnilikeFixture.deposit();
    UnilikeFixture.invest();
    UnilikeFixture.claim();
    UnilikeFixture.withdrawLPFromOriginalDeposit();
    UnilikeFixture.depositLP(6);
    UnilikeFixture.depositLP(7);
    UnilikeFixture.withdrawLP(6);
    UnilikeFixture.withdrawLP(7);
    UnilikeFixture.redeemSellSomeJr();
    UnilikeFixture.withdraw();
  });
});
