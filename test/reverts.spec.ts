import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import bn from "bignumber.js";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers, network } from "hardhat";
import { DEFAULT_VAULT_PARAMS } from "../scripts/utils/helpers";
import {
  AllPairVault,
  ForceSend,
  ForceSend__factory,
  IUniswapV2Router02,
  Registry,
  UniswapStrategy,
} from "../typechain";
import { addresses } from "./utils/addresses";
const { provider } = ethers;

use(solidity);

const e18 = new bn(10).pow(18);
const stre18 = e18.toFixed(0);
const e = new bn(10).pow(19);
const stre = e.toFixed(0);
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe("test reverts", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let uniswap: IUniswapV2Router02;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let impersonateVault: SignerWithAddress;
  let forceSend: ForceSend;
  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    const signer = signers[0];
    await deployments.fixture("UniswapStrategy");

    const forceSendFactory = new ForceSend__factory(signers[0]);
    forceSend = await forceSendFactory.deploy();

    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract("UniswapStrategy");
    registry = await ethers.getContract("Registry");
    await registry.enableTokens();
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [vault.address],
    });
    impersonateVault = await ethers.getSigner(vault.address);
    await forceSend.forceSend(vault.address, { value: stre });
  });
  it("reverts", async function () {
    await expect(
      strategy.addVault(
        0,
        "0x6b175474e89094c44da98b954eedeac495271d0f",
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
      )
    ).revertedWith("Unauthorized");
    await strategy
      .connect(impersonateVault)
      .addVault(
        0,
        "0x6b175474e89094c44da98b954eedeac495271d0f",
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
      );
    await expect(
      strategy
        .connect(impersonateVault)
        .addVault(
          0,
          "0x6b175474e89094c44da98b954eedeac495271d0f",
          "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
        )
    ).revertedWith("Vault id already registered");
    await expect(
      strategy
        .connect(impersonateVault)
        .addVault(1, addresses.zero, addresses.zero)
    ).revertedWith("Pool doesn't exist");
    const vaultParams = {
      ...DEFAULT_VAULT_PARAMS,
      strategy: addresses.zero,
      strategist: accounts[0],
      seniorAsset: addresses.zero,
      juniorAsset: addresses.zero,
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
        strategist: addresses.zero,
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
