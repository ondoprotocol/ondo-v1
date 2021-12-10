import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddress } from "../scripts/utils/helpers";
import { STRATEGY_ROLE } from "../scripts/utils/constants";

const deployAlchemix: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddress(hre);
  const registry = await ethers.getContract("Registry");
  await deploy("AlchemixLPStrategy", {
    from: deployer,
    args: [
      registry.address,
      address.alchemix.token,
      address.assets.weth,
      address.sushi.token,
      address.alchemix.slp,
      address.alchemix.pool,
      address.sushi.router,
      address.sushi.factory,
      address.sushi.xsushi,
      address.sushi.chef2,
      0,
      1,
    ],
    log: true,
  });

  const alchemixStrategy = await ethers.getContract("AlchemixLPStrategy");
  await registry.grantRole(STRATEGY_ROLE, alchemixStrategy.address);
};

export default deployAlchemix;
deployAlchemix.tags = ["AlchemixStrategy"];
deployAlchemix.dependencies = ["Base"];
