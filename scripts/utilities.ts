#!/usr/bin/env yarn --silent ts-node

/*
    Bugs:
        - on local node, need to call evm_mine to move the clock forward.
        - it's possible the flags in line 1 won't work on linux
 */

// import * as hre from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { AllPairVault } from "../typechain";
import { VaultParams } from "./utils/params";
import { BigNumber } from "ethers";
import { Address } from "hardhat-deploy/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";

const hre: HardhatRuntimeEnvironment = require("hardhat");
const ethers = hre.ethers;

async function createVault(vault: VaultParams): Promise<BigNumber> {
  const allPair = <AllPairVault>await ethers.getContract("AllPairVault");
  await allPair.createVault(vault);

  // BUG: This is returning an invalid vault ID.
  const encoded = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "address",
      "address",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
    ],
    [
      vault.seniorAsset,
      vault.juniorAsset,
      vault.strategy,
      vault.hurdleRate,
      vault.startTime,
      vault.startTime + vault.enrollment,
      vault.startTime + vault.enrollment + vault.duration,
    ]
  );
  const id: BigNumber = ethers.BigNumber.from(ethers.utils.keccak256(encoded));
  return id;
}

async function invest(vaultId: Address) {
  let signers: SignerWithAddress[] = await ethers.getSigners();

  const allPair = <AllPairVault>await ethers.getContract("AllPairVault");
  await allPair.connect(signers[0]).invest(vaultId, 0, 0); // TODO: Generate correct min values
}

async function redeem(vaultId: Address) {
  let signers: SignerWithAddress[] = await ethers.getSigners();

  const allPair = <AllPairVault>await ethers.getContract("AllPairVault");
  await allPair.connect(signers[0]).redeem(vaultId, 0, 0); // TODO: Generate correct min values
}

export { createVault, invest, redeem };
