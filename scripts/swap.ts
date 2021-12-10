import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { IUniswapV2Router02 } from "../typechain";
import * as allAddresses from "./utils/addresses";

const hre: HardhatRuntimeEnvironment = require("hardhat");
const ethers = hre.ethers;

async function runMe() {
  let address;
  // console.log(hre.network.name);
  if (hre.network.name == "rinkeby") {
    address = allAddresses.rinkeby;
  } else if (hre.network.name == "ropsten") {
    address = allAddresses.ropsten;
  } else {
    address = allAddresses.mainnet;
  }
  const e18 = ethers.BigNumber.from(10).pow(18); // 1 token, 18 decimals

  let signers: SignerWithAddress[] = await ethers.getSigners();
  let now: number = (await ethers.provider.getBlock("latest")).timestamp;

  let uniRouter = <IUniswapV2Router02>(
    await ethers.getContractAt("IUniswapV2Router02", address.uniswap.router)
  );

  for (let i = 0; i < 20; i++) {
    await uniRouter
      .connect(signers[i])
      .swapExactETHForTokens(
        0,
        [address.assets.weth, address.assets.dai],
        signers[i].address,
        now + 1000,
        { value: e18 }
      );
  }
}

runMe().catch((e) => console.log("ERROR: ", e));
