import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddress } from "../scripts/utils/helpers";
import { STRATEGY_ROLE } from "../scripts/utils/constants";

const deploySushiswap: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddress(hre);
  const registry = await ethers.getContract("Registry");
  await deploy("SushiStrategyLP", {
    from: deployer,
    args: [
      registry.address,
      address.sushi.router,
      address.sushi.chef,
      address.sushi.factory,
      address.sushi.token,
      address.sushi.xsushi,
    ],
    log: true,
  });
  const sushiStrategy = await ethers.getContract("SushiStrategyLP");
  await registry.grantRole(STRATEGY_ROLE, sushiStrategy.address);
};

export default deploySushiswap;
deploySushiswap.tags = ["SushiswapStrategy"];
deploySushiswap.dependencies = ["Base"];
