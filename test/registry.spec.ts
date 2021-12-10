import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers } from "hardhat";
import {
  CREATOR_ROLE,
  DEPLOYER_ROLE,
  STRATEGIST_ROLE,
  STRATEGY_ROLE,
  VAULT_ROLE,
} from "../scripts/utils/constants";
import { AllPairVault, Registry, UniswapStrategy } from "../typechain";
use(solidity);

describe("Registry", () => {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let signers: SignerWithAddress[];
  let signer: SignerWithAddress;
  let accounts: string[];
  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((x) => x.address);
    signer = signers[0];
    await deployments.fixture("UniswapStrategy");
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract("UniswapStrategy");
    registry = await ethers.getContract("Registry");
    await registry.enableTokens();
  });
  it("grant roles", async function () {
    await registry.grantRole(STRATEGIST_ROLE, accounts[0]);
    await registry.grantRole(CREATOR_ROLE, accounts[0]);
    await registry.grantRole(DEPLOYER_ROLE, accounts[0]);
  });
  it("register contracts", async function () {
    await registry.grantRole(STRATEGY_ROLE, strategy.address);
    const strategyAuthorized = await registry.authorized(
      STRATEGY_ROLE,
      strategy.address
    );
    expect(strategyAuthorized).eq(true);
    await registry.grantRole(VAULT_ROLE, vault.address);
    const vaultAuthorized = await registry.authorized(
      VAULT_ROLE,
      vault.address
    );
    expect(vaultAuthorized).eq(true);
  });
});
