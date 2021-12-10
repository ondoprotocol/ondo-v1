import { DeployFunction } from "hardhat-deploy/types";

const deployOndo: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("Ondo", {
    from: deployer,
    args: [deployer],
    log: true,
  });
};

export default deployOndo;
deployOndo.tags = ["Ondo"];
deployOndo.dependencies = ["Base"];
