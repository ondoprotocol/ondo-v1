import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";

const deployStakingPools: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const ondo = await ethers.getContract("Ondo");

  await deploy("StakingPools", {
    from: deployer,
    args: [deployer, ondo.address, "1000", 0, 1000], // needs to be changed based on args
    log: true,
  });
};

export default deployStakingPools;
deployStakingPools.tags = ["StakingPools"];
deployStakingPools.dependencies = ["Ondo"];
