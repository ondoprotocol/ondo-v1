import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { keccak256 } from "../test/utils/helpers";
import { pancakeswap } from "../test/utils/addresses";

const deployPancakeswapLP: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const registry = await ethers.getContract("Registry");
  await deploy("PancakeStrategyLP", {
    from: deployer,
    args: [
      registry.address,
      pancakeswap.router,
      pancakeswap.chef,
      pancakeswap.factory,
      pancakeswap.token,
    ],
    log: true,
  });

  const pancakeStrategyLP = await ethers.getContract("PancakeStrategyLP");
  let tx = await registry.grantRole(
    keccak256(Buffer.from("STRATEGY_ROLE", "utf-8")),
    pancakeStrategyLP.address
  );
  await tx.wait();
};

export default deployPancakeswapLP;
deployPancakeswapLP.tags = ["PancakeStrategyLP"];
deployPancakeswapLP.dependencies = ["Base"];
