import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddresses, keccak256 } from "../test/utils/helpers";

const deployBase: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddresses();

  await deploy("Registry", {
    from: deployer,
    args: [deployer, deployer, address.assets.weth],
    log: true,
  });
  const registry = await ethers.getContract("Registry");

  await deploy("TrancheToken", {
    from: deployer,
    log: true,
  });
  const trancheToken = await ethers.getContract("TrancheToken");

  await deploy("AllPairVault", {
    from: deployer,
    args: [registry.address, trancheToken.address],
    log: true,
  });

  const allPair = await ethers.getContract("AllPairVault");

  let tx = await registry.grantRole(
    keccak256(Buffer.from("DEPLOYER_ROLE", "utf-8")),
    deployer
  );
  await tx.wait();

  tx = await registry.grantRole(
    keccak256(Buffer.from("CREATOR_ROLE", "utf-8")),
    deployer
  );
  await tx.wait();

  tx = await registry.grantRole(
    keccak256(Buffer.from("STRATEGIST_ROLE", "utf-8")),
    deployer
  );
  await tx.wait();

  tx = await registry.grantRole(
    keccak256(Buffer.from("PANIC_ROLE", "utf-8")),
    deployer
  );
  tx = await registry.grantRole(
    keccak256(Buffer.from("GUARDIAN_ROLE", "utf-8")),
    deployer
  );
  await tx.wait();

  tx = await registry.grantRole(
    keccak256(Buffer.from("VAULT_ROLE", "utf-8")),
    allPair.address
  );
  await tx.wait();

  tx = await registry.grantRole(
    keccak256(Buffer.from("GOVERNANCE_ROLE", "utf-8")),
    deployer
  );
  await tx.wait();
};

export default deployBase;
deployBase.tags = ["Base"];
