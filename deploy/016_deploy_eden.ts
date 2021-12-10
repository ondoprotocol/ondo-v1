import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddress } from "../scripts/utils/helpers";
import { STRATEGY_ROLE } from "../scripts/utils/constants";

const deployEden: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddress(hre);
  const registry = await ethers.getContract("Registry");

  await deploy("EdenStrategy", {
    from: deployer,
    args: [
      registry.address,
      address.sushi.router,
      address.sushi.factory,
      address.eden.rewardManager,
      address.assets.weth,
      address.assets.eden,
      address.sushi.pools.eden_eth,
      address.sushi.token,
    ],
    log: true,
  });

  const edenStrategy = await ethers.getContract("EdenStrategy");
  await registry.grantRole(STRATEGY_ROLE, edenStrategy.address);
};

export default deployEden;
deployEden.tags = ["EdenStrategy"];
deployEden.dependencies = ["Base"];
