import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { keccak256 } from "ethers/lib/utils";
import { deployments, ethers } from "hardhat";
import { AllPairVault, Registry, UniswapStrategy } from "../../typechain";
import { getStrategyName } from "./utils/helpers";
use(solidity);

describe("Registry", () => {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let signers: SignerWithAddress[];
  let signer: SignerWithAddress;
  let accounts: string[];
  let strategyName: string;

  strategyName = getStrategyName();

  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((x) => x.address);
    signer = signers[0];
    await deployments.fixture(strategyName);
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract(strategyName);
    registry = await ethers.getContract("Registry");
    await registry.enableTokens();
  });
  it("grant roles", async function () {
    await registry.grantRole(
      keccak256(Buffer.from("STRATEGIST_ROLE", "utf-8")),
      accounts[0]
    );
    await registry.grantRole(
      keccak256(Buffer.from("CREATOR_ROLE", "utf-8")),
      accounts[0]
    );
    await registry.grantRole(
      keccak256(Buffer.from("DEPLOYER_ROLE", "utf-8")),
      accounts[0]
    );
  });
  it("register contracts", async function () {
    const stratRole = keccak256(Buffer.from("STRATEGY_ROLE", "utf-8"));
    await registry.grantRole(stratRole, strategy.address);
    const strategyAuthorized = await registry.authorized(
      stratRole,
      strategy.address
    );
    expect(strategyAuthorized).eq(true);
    const vaultRole = keccak256(Buffer.from("STRATEGY_ROLE", "utf-8"));
    await registry.grantRole(vaultRole, vault.address);
    const vaultAuthorized = await registry.authorized(vaultRole, vault.address);
    expect(vaultAuthorized).eq(true);
  });
});
