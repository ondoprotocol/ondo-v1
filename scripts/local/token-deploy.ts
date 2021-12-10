//To run, open two terminals:
//Make sure you have a deployed/ directory
//First terminal: `npx hardhat node` and leave open
//Second terminal: `npx ts-node -P ./tsconfig.json --files ./scripts/deploy.ts` and wait to finish
//Second terminal: `npx ts-node -P ./tsconfig.json --files ./scripts/token-deploy.ts`

require("dotenv").config();
import { writeFileSync } from "fs";
import { utils, Wallet, BigNumber } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { get_signers } from "../../test/utils/signing";
import { mainnet } from "../utils/addresses";
import { keccak256 } from "@ethersproject/keccak256";

const provider = new JsonRpcProvider("http://localhost:8545");

import * as contracts from "../../deployed/contracts.json";
import {
  AllPairVault__factory,
  IERC20__factory,
  IUniswapV2Router02__factory,
} from "../../typechain";
import Decimal from "decimal.js";

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;
const e18 = new Decimal(10).pow(18);
const fifty18 = new Decimal(10).pow(18).mul(50000).toFixed(0);
const stre8 = new Decimal(10).pow(8).toFixed(0);

async function testDeploy() {
  let signers: Wallet[];
  signers = await get_signers(process.env.MNEMONIC!, provider);
  const signer = signers[0];
  const vault = new AllPairVault__factory()
    .attach(contracts.vault)
    .connect(signer);
  const router = IUniswapV2Router02__factory.connect(
    mainnet.uniswap.router,
    signer
  );
  const dai = IERC20__factory.connect(mainnet.assets.dai, signer);
  const wbtc = IERC20__factory.connect(mainnet.assets.wbtc, signer);
  const weth = IERC20__factory.connect(mainnet.assets.weth, signer);
  for (let i = 0; i < signers.length; i++) {
    await router
      .connect(signers[i])
      .swapExactETHForTokens(
        0,
        [mainnet.assets.weth, mainnet.assets.wbtc],
        signers[i].address,
        (await provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(250).toFixed(0),
        }
      );
    await wbtc
      .connect(signers[i])
      .approve(vault.address, e18.mul(1000).toFixed(0));
    await router
      .connect(signers[i])
      .swapExactETHForTokens(
        0,
        [mainnet.assets.weth, mainnet.assets.dai],
        signers[i].address,
        (await provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(250).toFixed(0),
        }
      );
    await dai
      .connect(signers[i])
      .approve(vault.address, e18.mul(100000).toFixed(0));
  }
  async function getVault(
    asset1: string,
    asset2: string,
    strategy: string,
    start: number,
    srName: string,
    srSym: string,
    jrName: string,
    jrSym: string,
    srTCap: number,
    jrTCap: number,
    srUCap: number,
    jrUCap: number
  ) {
    await vault.createVault({
      seniorAsset: asset1,
      juniorAsset: asset2,
      strategist: signer.address,
      strategy: strategy,
      hurdleRate: hurdle,
      startTime: start,
      enrollment: enrollment,
      duration: duration,
      seniorName: srName,
      seniorSym: srSym,
      juniorName: jrName,
      juniorSym: jrSym,
      seniorTrancheCap: srTCap,
      juniorTrancheCap: jrTCap,
      seniorUserCap: srUCap,
      juniorUserCap: jrUCap,
    });
    const encoded = utils.defaultAbiCoder.encode(
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
        asset1,
        asset2,
        strategy,
        hurdle,
        start,
        start + enrollment,
        start + enrollment + duration,
      ]
    );
    return BigNumber.from(keccak256(encoded));
  }
  let start = (await provider.getBlock("latest")).timestamp + 1000000;
  const inactive = await getVault(
    mainnet.assets.wbtc,
    mainnet.assets.dai,
    contracts.uniStrat,
    start,
    "Sr1 Uni Inactive",
    "Vault1SR",
    "Jr1 Uni Inactive",
    "Vault1JR",
    0,
    0,
    0,
    0
  );
  start = (await provider.getBlock("latest")).timestamp + 3;
  const redeemableUni = await getVault(
    mainnet.assets.wbtc,
    mainnet.assets.dai,
    contracts.uniStrat,
    start,
    "Sr3 Uni Redeemable",
    "Vault3SR",
    "Jr3 Uni Redeemable",
    "Vault3JR",
    0,
    0,
    0,
    0
  );
  await provider.send("evm_mine", [start + 1]);
  // console.log((await wbtc.balanceOf(signers[0].address)).toString());
  // console.log(
  //   (await wbtc.allowance(signers[0].address, vault.address)).toString()
  // );
  // console.log(stre8.toString());
  await vault.connect(signers[0]).deposit(redeemableUni, 0, stre8);
  await vault
    .connect(signers[1])
    .deposit(redeemableUni, 1, e18.mul(5000).toFixed(0));
  await provider.send("evm_increaseTime", [enrollment + 1]);
  await vault.invest(redeemableUni, 0, 0);
  start = (await provider.getBlock("latest")).timestamp + 3;
  const investedUni = await getVault(
    mainnet.assets.wbtc,
    mainnet.assets.dai,
    contracts.uniStrat,
    start + duration,
    "Sr4 Sushi Invested",
    "Vault4SR",
    "Jr4 Sushi Invested",
    "Vault4JR",
    0,
    0,
    0,
    0
  );
  await provider.send("evm_increaseTime", [duration + 1]);
  await vault.redeem(redeemableUni, 0, 0);
  await vault.connect(signers[2]).deposit(investedUni, 0, stre8);
  await vault
    .connect(signers[3])
    .deposit(investedUni, 1, e18.mul(50000).toFixed(0));
  await provider.send("evm_increaseTime", [enrollment + 1]);
  await vault.invest(investedUni, 0, 0);
  const investedData = await vault.getVaultById(investedUni);
  start = (await provider.getBlock("latest")).timestamp + 3;
  const enrollingUni = await getVault(
    mainnet.assets.weth,
    mainnet.assets.dai,
    contracts.uniStrat,
    start,
    "Sr7 Uni Enrolling",
    "Vault7SR",
    "Jr7 Uni Enrolling",
    "Vault7JR",
    0,
    0,
    0,
    0
  );
  await provider.send("evm_mine", [start]);
  //  await vault.deposit(enrollingUni, 0, stre8);
  const vaults = {
    inactive: inactive,
    redeemableUni: redeemableUni,
    investedUni: investedUni,
    enrollingUni: enrollingUni,
  };
  writeFileSync("deployed/token-vaults.json", JSON.stringify(vaults, null, 2));
}

testDeploy();
