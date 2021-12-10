import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployMockRewarder: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  if (!hre.network.live) {
    await deploy("MockRewarder", {
      from: deployer,
      log: true,
    });
  }
};

export default deployMockRewarder;
deployMockRewarder.tags = ["MockRewarder"];
deployMockRewarder.dependencies = ["SushiStakingV2Strategy"];
