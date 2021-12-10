require("dotenv").config();
import * as hardhat from "hardhat";
import { Wallet, BigNumber } from "ethers";
import { UniPoolMock, UniPool } from "../../test/utils/uni";
import { rinkeby } from "../utils/addresses";
import Decimal from "decimal.js";
import { get_signers } from "../../test/utils/signing";
import * as contracts from "../../deployed/rinkeby-addresses.json";
require("dotenv").config();
import { writeFileSync } from "fs";
import _ from "lodash";
const provider = hardhat.ethers.provider;

const e18 = new Decimal(10).pow(18);
const stre18 = e18.mul(200).toFixed(0);

const format_pool = (pool: UniPool) => ({
  pool: pool.pool.address,
  token0: pool.token0.address,
  token1: pool.token1.address,
});

const format_pools = (pools: { [pid: string]: UniPool }) =>
  _.transform(
    pools,
    (acc: any, val, key) => {
      acc[key] = format_pool(val);
    },
    {}
  );
const serialize_pools = (pools: { [pid: string]: UniPool }) =>
  JSON.stringify(format_pools(pools), null, 2);

const log_pools = (pools: { [pid: string]: UniPool }) =>
  console.log(serialize_pools(pools));

export async function deployMocks() {
  let signers: Wallet[];
  signers = await get_signers(process.env.MNEMONIC!, provider);
  const pool1 = await UniPoolMock.createMock(
    signers[0],
    rinkeby.uniswap.router,
    BigNumber.from(stre18),
    BigNumber.from(stre18)
  );
  console.log("FIRST MOCK AWAY");
  const pool2 = await UniPoolMock.createMock(
    signers[0],
    rinkeby.uniswap.router,
    BigNumber.from(stre18),
    BigNumber.from(stre18)
  );
  console.log("SECOND MOCK AWAY");
  const pool3 = await UniPoolMock.createMock(
    signers[0],
    rinkeby.uniswap.router,
    BigNumber.from(stre18),
    BigNumber.from(stre18)
  );
  for (let i = 0; i < signers.length; i++) {
    await pool1.token0.mint(signers[i].address, stre18);
    await pool1.token0.connect(signers[i]).approve(contracts.vault, stre18);
    await pool1.token1.mint(signers[i].address, stre18);
    await pool1.token1.connect(signers[i]).approve(contracts.vault, stre18);

    await pool2.token0.mint(signers[i].address, stre18);
    await pool2.token0.connect(signers[i]).approve(contracts.vault, stre18);
    await pool2.token1.mint(signers[i].address, stre18);
    await pool2.token1.connect(signers[i]).approve(contracts.vault, stre18);

    await pool3.token0.mint(signers[i].address, stre18);
    await pool3.token0.connect(signers[i]).approve(contracts.vault, stre18);
    await pool3.token1.mint(signers[i].address, stre18);
    await pool3.token1.connect(signers[i]).approve(contracts.vault, stre18);
  }
  writeFileSync(
    "./deployed/testnet/rinkeby-mocks.json",
    serialize_pools({
      pool1,
      pool2,
      pool3,
    })
  );
}
