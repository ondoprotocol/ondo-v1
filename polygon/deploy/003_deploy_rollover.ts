import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { keccak256 } from "../test/utils/helpers";

const deployRollover: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const registry = await ethers.getContract("Registry");
  const allPair = await ethers.getContract("AllPairVault");
  const trancheToken = await ethers.getContract("TrancheToken");

  await deploy("RolloverVault", {
    from: deployer,
    args: [allPair.address, registry.address, trancheToken.address],
    log: true,
  });

  const rollover = await ethers.getContract("RolloverVault");

  let tx = await registry.grantRole(
    keccak256(Buffer.from("ROLLOVER_ROLE", "utf-8")),
    rollover.address
  );
  await tx.wait();

  tx = await registry.grantRole(
    keccak256(Buffer.from("CREATOR_ROLE", "utf-8")),
    rollover.address
  );
  await tx.wait();
};

export default deployRollover;
deployRollover.tags = ["RolloverVault"];
deployRollover.dependencies = ["Base"];
