// import { ethers } from 'ethers';
// import { UniPool, UniPoolMock} from '../test/utils/uni'
// import { createDebugSigner } from "../test/utils/DebugSigner";
// import { Wallet, Signer, utils } from "ethers";
// // const DebugWallet = createDebugSigner(Wallet);
// import { JsonRpcProvider } from "@ethersproject/providers";

const Registry = artifacts.require("Registry");
// const PairCCO = artifacts.require("PairCCO")
// const UniswapStrategy = artifacts.require("UniswapStrategy")

// const provider = new JsonRpcProvider("http://localhost:8545");

module.exports = async function (deployer) {
  // const signer = new DebugWallet(
  //   (<any>PairRegistry).debugger,
  //   "0xb12dbc2f2773ce283c3ef3aabd88cf29994401cd38441fa6a5600476285d03fe",
  //   provider
  // );
  // const pool = await UniPoolMock.createMock(signer, 0, 0)
  // await deployer.deploy(Registry);
  // const registry = await PairRegistry.deployed()
  // await deployer.deploy(PairCCO, pool.token0.address, pool.token1.address, registry.address, "")
  // await deployer.deploy(UniswapStrategy, registry.address)
} as Truffle.Migration;

// because of https://stackoverflow.com/questions/40900791/cannot-redeclare-block-scoped-variable-in-unrelated-files
export {};
