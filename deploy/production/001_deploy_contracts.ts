import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {};

export default func;
func.tags = ["prod"];
func.dependencies = ["Base-prod", "UniswapStrategy-prod"];
