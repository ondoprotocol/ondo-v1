#!/usr/bin/env yarn --silent ts-node
const hre = require("hardhat");

hre.ethers.provider.send("evm_mine");
