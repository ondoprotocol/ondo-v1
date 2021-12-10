import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import * as helpers from "../scripts/utils/helpers";
import { AllPairVault, TrancheToken, UniswapStrategy } from "../typechain";
import { addresses } from "./utils/addresses";
import * as get from "./utils/getters";
import { UniPoolMock } from "./utils/uni";
import { get_tranche_tokens } from "./utils/vault";

use(solidity);

const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const { provider } = ethers;
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

describe("Create2", async function () {
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let pool: UniPoolMock;
  let srERC20: TrancheToken;
  let jrERC20: TrancheToken;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let vaultId: BigNumber;
  let trancheTokenImpl: string;
  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    await deployments.fixture("UniswapStrategy");
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract("UniswapStrategy");
    trancheTokenImpl = (await ethers.getContract("TrancheToken")).address;
    await setup();
  });
  async function setup() {
    pool = await UniPoolMock.createMock(
      signers[0],
      addresses.uniswap.router,
      BigNumber.from(stre18),
      BigNumber.from(stre18)
    );
  }
  function createVault() {
    it("create Vault", async function () {
      const startTime = (await provider.getBlock("latest")).timestamp + 3;
      const vaultParams = {
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime: startTime,
        enrollment: enrollment,
        duration: duration,
      };
      let investAt, redeemAt;
      ({ id: vaultId, investAt, redeemAt } = await helpers.createVault(
        vault,
        vaultParams
      ));
      await provider.send("evm_mine", [startTime]);

      const vaultObj = await vault.getVaultById(vaultId);
      const tokens = get_tranche_tokens(
        trancheTokenImpl,
        vault.address,
        vaultId
      );

      srERC20 = await ethers.getContractAt(
        "TrancheToken",
        vaultObj.assets[0].trancheToken,
        signers[0]
      );
      jrERC20 = await ethers.getContractAt(
        "TrancheToken",
        vaultObj.assets[1].trancheToken,
        signers[1]
      );
      const srTokenVault = await vault.VaultsByTokens(srERC20.address);
      const jrTokenVault = await vault.VaultsByTokens(jrERC20.address);
      expect(vaultObj.assets[0].trancheToken).eq(tokens[0]);
      expect(vaultObj.assets[1].trancheToken).eq(tokens[1]);
      expect(srTokenVault).equal(vaultId);
      expect(jrTokenVault).equal(vaultId);
      expect(await srERC20.vaultId()).equal(vaultId);
      expect(await jrERC20.vaultId()).equal(vaultId);
      expect(await srERC20.vault()).equal(vault.address);
      expect(await jrERC20.vault()).equal(vault.address);
      expect(await srERC20.symbol()).equal("SR");
      expect(await jrERC20.symbol()).equal("JR");

      expect(await get.hurdleRate(vault, vaultId)).eq(hurdle);
      expect(await get.investAt(vault, vaultId)).eq(investAt);
      expect(await get.redeemAt(vault, vaultId)).eq(redeemAt);
      expect(await get.strategy(vault, vaultId)).eq(strategy.address);
      expect(await get.seniorAsset(vault, vaultId)).eq(pool.token0.address);
      expect(await get.juniorAsset(vault, vaultId)).eq(pool.token1.address);
      await expect(strategy.invest(vaultId, 0, 0, 0, 0, 0, 0)).revertedWith(
        "Unauthorized: Only Vault contract"
      );
      await expect(strategy.redeem(vaultId, 0, 0, 0)).revertedWith(
        "Unauthorized: Only Vault contract"
      );
    });
  }
  createVault();
});
