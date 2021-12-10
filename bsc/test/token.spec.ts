import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import bn from "bignumber.js";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, BigNumberish } from "ethers";
import { deployments, ethers, network } from "hardhat";
import { createVault, getStrategyName } from "./utils/helpers";
import {
  AllPairVault,
  IUniswapV2Router02,
  Registry,
  TrancheToken,
  UniswapStrategy,
} from "../../typechain";
import { getAmmAddresses } from "./utils/addresses";
import { UniPoolMock } from "./utils/uni";
const { provider } = ethers;
use(solidity);

const e18 = new bn(10).pow(18);

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("TrancheToken", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let pool: UniPoolMock;
  let uniswap: IUniswapV2Router02;
  let jrERC20: TrancheToken;
  let srERC20: TrancheToken;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let vaultId: BigNumber;
  let amountIn: BigNumberish;
  let router: string;
  let strategyName: string;

  strategyName = getStrategyName();

  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    const signer = signers[0];
    await deployments.fixture(strategyName);

    registry = await ethers.getContract("Registry");
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract(strategyName);
    await registry.enableTokens();

    router = getAmmAddresses().router;
    pool = await UniPoolMock.createMock(signers[0], router, 0, 0);
    uniswap = pool.router;
  });
  it("spin up tranche tokens on Vault creation", async function () {
    const startTime = (await provider.getBlock("latest")).timestamp + 60;
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
    ({ id: vaultId, investAt, redeemAt } = await createVault(
      vault,
      vaultParams
    ));

    await provider.send("evm_mine", [startTime]);

    const vaultObj = await vault.getVaultById(vaultId);
    srERC20 = await ethers.getContractAt(
      "TrancheToken",
      vaultObj.assets[0].trancheToken,
      signers[0]
    );
    jrERC20 = await ethers.getContractAt(
      "TrancheToken",
      vaultObj.assets[1].trancheToken,
      signers[1]
    );
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
  it("deposit base assets during Deposit phase", async function () {
    amountIn = e18.times(3).toFixed();
    await pool.mint("zero", amountIn, accounts[0]);
    await pool.mint("one", amountIn, accounts[1]);
    await pool.token0.connect(signers[0]).approve(vault.address, amountIn);
    await pool.token1.connect(signers[1]).approve(vault.address, amountIn);
    await vault.connect(signers[0]).deposit(vaultId, 0, amountIn);
    await vault.connect(signers[1]).deposit(vaultId, 1, amountIn);
    const token0Balance = await pool.token0.balanceOf(strategy.address);
    const token1Balance = await pool.token1.balanceOf(strategy.address);
    expect(token0Balance).equal(amountIn);
    expect(token1Balance).equal(amountIn);
    const vaultSrDeposited = (await vault.getVaultById(vaultId)).assets[0]
      .deposited;
    const vaultJrDeposited = (await vault.getVaultById(vaultId)).assets[1]
      .deposited;
    expect(vaultSrDeposited).equal(amountIn);
    expect(vaultJrDeposited).equal(amountIn);
    await network.provider.send("evm_increaseTime", [enrollment + 1]);
  });
  it("claim tokens only after investment", async function () {
    const srTransferBefore = vault.connect(signers[0]).claim(vaultId, 0);
    const jrTransferBefore = vault.connect(signers[1]).claim(vaultId, 1);
    await expect(srTransferBefore).revertedWith("Invalid operation");
    await expect(jrTransferBefore).revertedWith("Invalid operation");
    await vault.invest(vaultId, 0, 0);
    await vault.connect(signers[0]).claim(vaultId, 0);
    await vault.connect(signers[1]).claim(vaultId, 1);
    const srBalance = await srERC20.balanceOf(accounts[0]);
    const jrBalance = await jrERC20.balanceOf(accounts[1]);
    expect(srBalance).equal(amountIn);
    expect(jrBalance).equal(amountIn);
    await srERC20.transfer(accounts[1], 100);
    await jrERC20.transfer(accounts[0], 100);
    expect(await srERC20.balanceOf(accounts[1])).equal(100);
    expect(await jrERC20.balanceOf(accounts[0])).equal(100);
  });
  it("approve and transferFrom", async function () {
    await jrERC20.connect(signers[0]).approve(accounts[2], 100);
    await jrERC20
      .connect(signers[2])
      .transferFrom(accounts[0], accounts[3], 100);
    expect(await jrERC20.balanceOf(accounts[0])).equal(0);
    expect(await jrERC20.balanceOf(accounts[3])).equal(100);
  });
});
