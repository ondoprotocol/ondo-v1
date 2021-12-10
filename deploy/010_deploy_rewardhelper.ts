import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { getAddress } from "../scripts/utils/helpers";

const deployAlchemixUserReward: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const sushiV2Strat = await ethers.getContract("SushiStakingV2Strategy");

  const address = getAddress(hre);

  await deploy("AlchemixUserReward", {
    from: deployer,
    args: [
      address.alchemix.pool,
      address.alchemix.token,
      sushiV2Strat.address,
      1,
    ], // needs to be changed based on args
    log: true,
  });
};

export default deployAlchemixUserReward;
deployAlchemixUserReward.tags = ["AlchemixUserReward"];
deployAlchemixUserReward.dependencies = ["SushiStakingV2Strategy"];
