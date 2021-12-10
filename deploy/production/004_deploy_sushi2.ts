import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getAddress } from "../../scripts/utils/helpers";

const deploySushiV2: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddress(hre);

  // TODO: fill in registry address
  const registryAddress = "";

  await deploy("SushiStakingV2Strategy", {
    from: deployer,
    args: [
      registryAddress,
      address.sushi.router,
      address.sushi.chef2,
      address.sushi.factory,
      address.sushi.token,
    ],
    log: true,
  });
  // const sushiStrategy = await ethers.getContract("SushiStakingV2Strategy");
  // await registry.grantRole(STRATEGY_ROLE, sushiStrategy.address);
};

export default deploySushiV2;
deploySushiV2.tags = ["SushiStakingV2Strategy-prod"];
deploySushiV2.dependencies = ["Base"];
