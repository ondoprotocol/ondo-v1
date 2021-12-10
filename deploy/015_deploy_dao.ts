import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { BigNumber } from "ethers";

// Initial Governance Parameters
export const TIMELOCK_DELAY = 2 * 24 * 60 * 60; // 2 days in seconds
export const VOTING_PERIOD = 17280; // 3 days in blocks
export const VOTING_PERIOD_FOR_TEST = 5760; // minimum
export const PROPOSAL_PENDING = 1; // in blocks
export const PROPOSAL_THRESHOLD = BigNumber.from(10).pow(18).mul(50000000); // in tokens

const deployDao: DeployFunction = async (hre) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const ondo = await ethers.getContract("Ondo");

  // deploy Timelock
  await deploy("Timelock", {
    from: deployer,
    args: [
      deployer,
      TIMELOCK_DELAY, // execution delay in seconds
    ],
    log: true,
  });
  const timelock = await ethers.getContract("Timelock");

  // deploy DAO implementation
  await deploy("GovernorBravoDelegate", {
    from: deployer,
    log: true,
  });
  const daoImpl = await ethers.getContract("GovernorBravoDelegate");

  // deploy DAO delegator
  await deploy("GovernorBravoDelegator", {
    from: deployer,
    args: [
      timelock.address, // timelock
      ondo.address, // Ondo token
      deployer, // admin
      daoImpl.address, // implementation
      network.live ? VOTING_PERIOD : VOTING_PERIOD_FOR_TEST, // voting period in blocks
      PROPOSAL_PENDING, // proposal pending period in blocks
      PROPOSAL_THRESHOLD, // proposal threshold in Ondos
    ],
    log: true,
  });
};

export default deployDao;
deployDao.tags = ["Dao"];
deployDao.dependencies = ["Ondo"];
