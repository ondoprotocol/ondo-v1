import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import bn from "bignumber.js";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import * as helpers from "./utils/helpers";
import {
  AllPairVault,
  IUniswapV2Pair,
  IUniswapV2Router02,
  Registry,
  UniswapStrategy,
} from "../../typechain";
import { getAmmAddresses } from "./utils/addresses";
import { UniPoolMock } from "./utils/uni";
const { provider } = ethers;
use(solidity);

const e18 = new bn(10).pow(18);
const amountIn = BigNumber.from(e18.toFixed());

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("Rescue functions", async function () {
  let signers: SignerWithAddress[];
  let accounts: string[];
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let pool: UniPoolMock;
  let uniswap: IUniswapV2Router02;
  let vaultIds: BigNumber[] = [];
  let pools: IUniswapV2Pair[] = [];
  let router: string;
  let strategyName: string;

  strategyName = helpers.getStrategyName();

  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    const signer = signers[0];
    await deployments.fixture(strategyName);
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract(strategyName);
    registry = await ethers.getContract("Registry");

    await registry.enableTokens();

    router = getAmmAddresses().router;
    pool = await UniPoolMock.createMock(signers[0], router, 0, 0);
    uniswap = pool.router;
  });
  async function createVault() {
    const startTime = (await provider.getBlock("latest")).timestamp + 10;
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
    pools.push(pool.pool);
    return vaultId;
  }
  async function deposit(vaultId: BigNumber) {
    await pool.mint("zero", amountIn, accounts[0]);
    await pool.mint("one", amountIn, accounts[1]);
    await pool.token0.connect(signers[0]).approve(vault.address, amountIn);
    await pool.token1.connect(signers[1]).approve(vault.address, amountIn);
    await vault.connect(signers[0]).deposit(vaultId, 0, amountIn);
    await vault.connect(signers[1]).deposit(vaultId, 1, amountIn);
  }
  function pause() {
    it("pauses and freezes Vault functions", async function () {
      await registry.connect(signers[0]).pause();
      expect(await registry.paused()).eq(true);
      await expect(vault.deposit(vaultIds[0], 0, amountIn)).revertedWith(
        "Pausable: paused"
      );
      await expect(vault.invest(vaultIds[0], 0, 0)).revertedWith(
        "Pausable: paused"
      );
      await expect(vault.claim(vaultIds[0], 0)).revertedWith(
        "Pausable: paused"
      );
      await expect(vault.depositLp(vaultIds[0], amountIn)).revertedWith(
        "Pausable: paused"
      );
      await expect(vault.withdrawLp(vaultIds[1], amountIn)).revertedWith(
        "Pausable: paused"
      );
      await expect(vault.redeem(vaultIds[0], 0, 0)).revertedWith(
        "Pausable: paused"
      );
      await expect(vault.withdraw(vaultIds[0], 0)).revertedWith(
        "Pausable: paused"
      );
    });
  }
  function unpause() {
    it("stops the pause and restores functionality", async function () {
      await registry.connect(signers[0]).unpause();
      expect(await registry.paused()).eq(false);
    });
  }
  describe("pause and rescue asset and LP tokens", async function () {
    before(async function () {
      const vault1 = await createVault();
      await deposit(vault1);
      const vault2 = await createVault();
      await deposit(vault2);
      const vault3 = await createVault();
      await deposit(vault3);
      await provider.send("evm_increaseTime", [enrollment + 1]);
      await vault.invest(vault1, 0, 0);
      await vault.invest(vault2, 0, 0);
    });
    it("doesn't allow rescuing tokens outside of pause mode", async function () {
      await expect(
        strategy.rescueTokens(
          [pool.token0.address, pool.token1.address],
          [0, 0]
        )
      ).revertedWith("Pausable: not paused");
    });
    pause();
    it("rescue tokens", async function () {
      const lpBefore1 = (await strategy.getVaultInfo(vaultIds[0]))[1];
      const lpBefore2 = (await strategy.getVaultInfo(vaultIds[1]))[1];
      const uninvestedBefore0 = await pool.token0.balanceOf(strategy.address);
      const uninvestedBefore1 = await pool.token1.balanceOf(strategy.address);
      await strategy.rescueTokens(
        [pool.pool.address, pool.token0.address, pool.token1.address],
        [0, 0, 0]
      );
      const strategyLpBalanceAfter = await pool.pool.balanceOf(
        strategy.address
      );
      const strategyBalance0After = await pool.token0.balanceOf(
        strategy.address
      );
      const strategyBalance1After = await pool.token1.balanceOf(
        strategy.address
      );
      expect(strategyLpBalanceAfter).equal(0);
      expect(strategyBalance0After).equal(0);
      expect(strategyBalance1After).equal(0);
      const strategistLpBalanceAfter = await pool.pool.balanceOf(accounts[0]);
      const strategistBalance0After = await pool.token0.balanceOf(accounts[0]);
      const strategistBalance1After = await pool.token1.balanceOf(accounts[0]);
      expect(strategistLpBalanceAfter).equal(lpBefore1.add(lpBefore2));
      expect(strategistBalance0After).equal(amountIn);
      expect(strategistBalance1After).equal(amountIn);
    });
    unpause();
  });
});
