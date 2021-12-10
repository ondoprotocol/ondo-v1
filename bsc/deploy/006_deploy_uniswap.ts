import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getAddress, keccak256 } from "../test/utils/helpers";

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
  let tx = await registry.grantRole(
    keccak256(Buffer.from("STRATEGY_ROLE", "utf-8")),
    uniStrategy.address
  );
  await tx.wait();
};

export default deployUniswap;
deployUniswap.tags = ["UniswapStrategy"];
deployUniswap.dependencies = ["Base"];
