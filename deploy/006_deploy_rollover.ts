import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { CREATOR_ROLE, ROLLOVER_ROLE } from "../scripts/utils/constants";

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
  await registry.grantRole(ROLLOVER_ROLE, rollover.address);
  await registry.grantRole(CREATOR_ROLE, rollover.address);
};

export default deployRollover;
deployRollover.tags = ["RolloverVault"];
deployRollover.dependencies = ["Base"];
