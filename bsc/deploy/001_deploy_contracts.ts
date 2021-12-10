import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {};

export default func;
func.tags = ["softlaunch"];
func.dependencies = ["Base", "UniswapStrategy", "PancakeStrategy"];
