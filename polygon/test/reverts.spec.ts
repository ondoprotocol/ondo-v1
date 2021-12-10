import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import bn from "bignumber.js";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers, network } from "hardhat";
import {
  DEFAULT_VAULT_PARAMS,
  getAddresses,
  getStrategyName,
} from "./utils/helpers";
import {
  AllPairVault,
  ForceSend,
  ForceSend__factory,
  IUniswapV2Router02,
  Registry,
  UniswapStrategy,
} from "../../typechain";
import { Addresses } from "./utils/addresses";
const { provider } = ethers;

use(solidity);

const e18 = new bn(10).pow(18);
const stre18 = e18.toFixed(0);
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("test reverts", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let uniswap: IUniswapV2Router02;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let impersonateVault: SignerWithAddress;
  let forceSend: ForceSend;
  let chain: Addresses;
  let strategyName: string;

  chain = getAddresses();
  strategyName = getStrategyName();

  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    const signer = signers[0];
    await deployments.fixture(strategyName);

    const forceSendFactory = new ForceSend__factory(signers[0]);
    forceSend = await forceSendFactory.deploy();

    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract(strategyName);
    registry = await ethers.getContract("Registry");
    await registry.enableTokens();
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [vault.address],
    });
    impersonateVault = await ethers.getSigner(vault.address);
    await forceSend.forceSend(vault.address, { value: stre18 });
  });
  it("reverts", async function () {
    await expect(
      strategy.addVault(0, chain.assets.dai, chain.assets.weth)
    ).revertedWith("Unauthorized");
    await strategy
      .connect(impersonateVault)
      .addVault(0, chain.assets.dai, chain.assets.weth);
    await expect(
      strategy
        .connect(impersonateVault)
        .addVault(0, chain.assets.dai, chain.assets.weth)
    ).revertedWith("Vault id already registered");
    await expect(
      strategy.connect(impersonateVault).addVault(1, chain.zero, chain.zero)
    ).revertedWith("Pool doesn't exist");
    const vaultParams = {
      ...DEFAULT_VAULT_PARAMS,
      strategy: chain.zero,
      strategist: accounts[0],
      seniorAsset: chain.zero,
      juniorAsset: chain.zero,
      hurdleRate: hurdle,
      startTime: (await provider.getBlock("latest")).timestamp + 5,
      enrollment: enrollment,
      duration: duration,
    };
    await expect(vault.createVault(vaultParams)).revertedWith("Invalid target");
    vaultParams.strategy = strategy.address;
    await expect(
      vault.createVault({
        ...vaultParams,
        startTime: (await provider.getBlock("latest")).timestamp + 5,
        strategist: chain.zero,
      })
    ).revertedWith("Invalid target");
    await expect(
      vault.createVault({
        ...vaultParams,
        startTime: (await provider.getBlock("latest")).timestamp + 5,
        strategist: accounts[0],
        enrollment: 0,
      })
    ).revertedWith("No zero intervals");
    await expect(
      vault.createVault({
        ...vaultParams,
        startTime: (await provider.getBlock("latest")).timestamp + 5,
        duration: 0,
        enrollment: enrollment,
      })
    ).revertedWith("No zero intervals");
    await expect(
      vault.createVault({
        ...vaultParams,
        enrollment: enrollment,
        startTime: (await provider.getBlock("latest")).timestamp - 5,
      })
    ).revertedWith("Invalid start time");
    await expect(
      vault.createVault({
        ...vaultParams,
        hurdleRate: 100000000000000,
        startTime: (await provider.getBlock("latest")).timestamp + 5,
      })
    ).revertedWith("Maximum hurdle is 10000%");
    await expect(
      vault.createVault({
        ...vaultParams,
        hurdleRate: hurdle,
        startTime: (await provider.getBlock("latest")).timestamp + 5,
        seniorAsset: vault.address,
      })
    ).revertedWith("Invalid target");
  });
});
