import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddress } from "../scripts/utils/helpers";
import { STRATEGY_ROLE } from "../scripts/utils/constants";

const deployBond: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddress(hre);
  const registry = await ethers.getContract("Registry");

  await deploy("BondStrategy", {
    from: deployer,
    args: [
      registry.address,
      address.uniswap.router,
      address.uniswap.factory,
      address.bond.rewardStakingPool,
      address.bond.yieldFarm,
      address.assets.usdc,
      address.assets.bond,
      address.uniswap.pools.usdc_bond,
    ],
    log: true,
  });

  const bondStrategy = await ethers.getContract("BondStrategy");
  await registry.grantRole(STRATEGY_ROLE, bondStrategy.address);
};

export default deployBond;
deployBond.tags = ["BondStrategy"];
deployBond.dependencies = ["Base"];
