import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddress } from "../../scripts/utils/helpers";
import { STRATEGY_ROLE } from "../../scripts/utils/constants";
import { mainnet } from "../../scripts/utils/addresses";

const deployUniswap: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddress(hre);
  const registry = await ethers.getContract("Registry");
  await deploy("UniswapStrategy", {
    from: deployer,
    args: [
      registry.address,
      address.uniswap.router,
      address.uniswap.factory,
      [],
      [],
    ],
    log: true,
  });
  const uniStrategy = await ethers.getContract("UniswapStrategy");
  // await registry.grantRole(STRATEGY_ROLE, uniStrategy.address);
};

export default deployUniswap;
deployUniswap.tags = ["UniswapStrategy-prod"];
deployUniswap.dependencies = ["Base-prod"];
