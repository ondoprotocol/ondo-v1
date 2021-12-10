import * as hardhat from "hardhat";
import {
  Registry__factory,
  AllPairVault__factory,
  IUniswapV2Router02__factory,
  IERC20__factory,
  AllPairVault,
  Registry,
} from "../../../typechain";
import * as addresses from "../../../deployed/ropsten-addresses.json";
import { keccak256 } from "ethers/lib/utils";
import { rinkeby } from "../../utils/addresses";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";
import { writeFileSync } from "fs";
import * as vaultIds from "./deployed/vault-id.json";

const e18 = new Decimal(10).pow(18);
const tenthEth = e18.div(10).toFixed(0);

export async function initiate(enrollment: number, duration: number) {
  const [signer] = await hardhat.ethers.getSigners();
  const vault = <AllPairVault>await hardhat.ethers.getContract("AllPairVault");

  const uni = IERC20__factory.connect(rinkeby.uniswap.token, signer);
  const weth = IERC20__factory.connect(rinkeby.assets.weth, signer);
  const start =
    (await hardhat.ethers.provider.getBlock("latest")).timestamp + 300;
  const createTx = await vault
    .createVault(
      {
        seniorAsset: weth.address,
        juniorAsset: uni.address,
        strategist: signer.address,
        strategy: addresses.uniStrategy,
        hurdleRate: 1000,
        startTime: start,
        enrollment: enrollment,
        duration: duration,
        seniorName: "SR",
        seniorSym: "SR",
        juniorName: "JR",
        juniorSym: "JR",
        seniorTrancheCap: 0,
        juniorTrancheCap: 0,
        seniorUserCap: 0,
        juniorUserCap: 0,
      },
      { gasLimit: 8000000 }
    )
    .catch((e: any) => {
      console.log(JSON.stringify(e));
    });
  console.log("CREATED");
  const encoded = hardhat.ethers.utils.defaultAbiCoder.encode(
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
      weth.address,
      uni.address,
      addresses.uniStrategy,
      1000,
      start,
      start + enrollment,
      start + enrollment + duration,
    ]
  );
  const id = BigNumber.from(keccak256(encoded));
  const ids = vaultIds;
  ids.ids.push(id.toHexString());
  writeFileSync("deployed/vault-id.json", JSON.stringify(ids));
}

export async function deposit(id: BigNumber) {
  const [signer] = await hardhat.ethers.getSigners();
  const vault = <AllPairVault>await hardhat.ethers.getContract("AllPairVault");
  await vault.connect(signer).deposit(id, 0, tenthEth, { gasLimit: 1000000 });
  await vault.connect(signer).deposit(id, 1, tenthEth, {
    gasLimit: 1000000,
  });
}

export async function invest(id: BigNumber) {
  const [signer] = await hardhat.ethers.getSigners();
  const vault = <AllPairVault>await hardhat.ethers.getContract("AllPairVault");
  await vault.connect(signer).invest(id, 0, 0, { gasLimit: 2000000 });
}

export async function redeem(id: BigNumber) {
  const [signer] = await hardhat.ethers.getSigners();
  const vault = <AllPairVault>await hardhat.ethers.getContract("AllPairVault");
  await vault.connect(signer).redeem(id, 0, 0, { gasLimit: 2000000 });
}
