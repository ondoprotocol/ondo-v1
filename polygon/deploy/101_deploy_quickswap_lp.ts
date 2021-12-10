import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { keccak256 } from "../../scripts/utils/helpers";
import { quickswapLP } from "../test/utils/addresses";

const deployQuickswapLP: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const registry = await ethers.getContract("Registry");
  await deploy("QuickSwapStrategyLP", {
    from: deployer,
    args: [
      registry.address,
      quickswapLP.router,
      quickswapLP.chef,
      quickswapLP.factory,
      quickswapLP.token,
      quickswapLP.staking,
    ],
    log: true,
  });

  const quickswapStrategyLP = await ethers.getContract("QuickSwapStrategyLP");
  let tx = await registry.grantRole(
    keccak256(Buffer.from("STRATEGY_ROLE", "utf-8")),
    quickswapStrategyLP.address
  );
  await tx.wait();
};

export default deployQuickswapLP;
deployQuickswapLP.tags = ["QuickSwapStrategyLP"];
deployQuickswapLP.dependencies = ["Base"];
