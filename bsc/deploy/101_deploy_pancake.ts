import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddress, keccak256 } from "../test/utils/helpers";

const deployPancake: DeployFunction = async () => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const address = getAddress(hre);
  const registry = await ethers.getContract("Registry");
  await deploy("PancakeStrategy", {
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

  const pancakeStrategy = await ethers.getContract("PancakeStrategy");
  let tx = await registry.grantRole(
    keccak256(Buffer.from("STRATEGY_ROLE", "utf-8")),
    pancakeStrategy.address
  );
  await tx.wait();
};

export default deployPancake;
deployPancake.tags = ["PancakeStrategy"];
deployPancake.dependencies = ["Base"];
