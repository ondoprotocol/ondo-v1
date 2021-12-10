import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployTestRewardHelper: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!hre.network.live) {
    await deploy("TestRewardHelper", {
      from: deployer,
      log: true,
    });
  }
};

export default deployTestRewardHelper;
deployTestRewardHelper.tags = ["TestRewardHelper"];
deployTestRewardHelper.dependencies = [
  "SushiStakingV2Strategy",
  "MockRewarder",
];
