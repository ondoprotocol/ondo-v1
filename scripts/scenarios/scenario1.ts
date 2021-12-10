#!/usr/bin/env yarn --silent hardhat run --no-compile

import hre from "hardhat";

/**
 * Scenario 1
 * - Create a vault with upcoming state
 * - Create a vault with invest state
 * - Create a vault with expired state
 */
const main = async () => {
  const upcomingVault = await hre.run("createVault", {
    seniorAsset: "WETH",
    juniorAsset: "LINK",
    strategy: "Sushiswap",
    startTime: 100,
    sushiPoolId: 8,
    pathFromSushi: "WETH",
  });
  const investVault = await hre.run("createVault", {
    seniorAsset: "USDT",
    juniorAsset: "USDC",
    strategy: "Uniswap",
    startTime: 100,
  });
  const expiredVault = await hre.run("createVault", {
    seniorAsset: "USDT",
    juniorAsset: "USDC",
    strategy: "Uniswap",
    startTime: 100,
  });

  console.log("Moving states...");

  console.log("Upcoming Vault: " + upcomingVault);

  // prepare assets
  await hre.run("swap", {
    to: "USDT",
    amount: "1e18",
    only: 0,
  });
  await hre.run("swap", {
    to: "USDC",
    amount: "1e18",
    only: 0,
  });

  // invest state
  await hre.run("deposit", {
    vaultId: investVault,
    asset: "USDT",
    amount: "100e6",
    user: 0,
  });
  await hre.run("deposit", {
    vaultId: investVault,
    asset: "USDC",
    amount: "100e6",
    user: 0,
  });
  await hre.run("invest", {
    vaultId: investVault,
    user: 0,
  });
  console.log("Invest Vault: " + investVault);

  // expired state
  await hre.run("deposit", {
    vaultId: expiredVault,
    asset: "USDT",
    amount: "100e6",
    user: 0,
  });
  await hre.run("deposit", {
    vaultId: expiredVault,
    asset: "USDC",
    amount: "100e6",
    user: 0,
  });
  await hre.run("invest", {
    vaultId: expiredVault,
    user: 0,
  });
  await hre.run("redeem", {
    vaultId: expiredVault,
    user: 0,
  });
  console.log("Expired Vault: " + expiredVault);
};

main();
