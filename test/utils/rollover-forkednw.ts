import { expect } from "chai";
import { ethers, network } from "hardhat";
import Decimal from "decimal.js";
import { BigNumber, utils } from "ethers";
import { keccak256 } from "@ethersproject/keccak256";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { createVault, DEFAULT_VAULT_PARAMS } from "../../scripts/utils/helpers";
import {
  AllPairVault,
  ERC20Mock,
  RolloverVault,
  TrancheToken,
  TrancheToken__factory,
  UniswapStrategy,
} from "../../typechain";
import { UniPoolMock } from "./uni";
import * as get from "./getters";
import { mainnet } from "../../scripts/utils/addresses";
import { buyTokensWithEth, swapEthtoWeth } from "./gen-utils";
import logger from "./logger";
import { Signer } from "crypto";
const { provider } = ethers;

let signers: SignerWithAddress[];
let accounts: string[];

let allPair: AllPairVault;
let pool: any;
let roll: RolloverVault;
let strategy: UniswapStrategy;
let srRoll: TrancheToken;
let jrRoll: TrancheToken;

let rollId: BigNumber;
let round = 0;

const e18 = new Decimal(10).pow(18);
const e6 = new Decimal(10).pow(6);
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;
const srAmountIn = BigNumber.from(e6.times(1000).toFixed());
const jrAmountIn = BigNumber.from(e18.times(10).toFixed());
const ethRequiredToGetJrAsset = 1000;
const srGreaterAmount = BigNumber.from(e6.times(3000).toFixed());
const amountToMint = BigNumber.from(e18.times(20).toFixed()); //some signers mint this amount

let token0 = mainnet.assets.usdc;
let token1 = mainnet.bond.token;
let poolAddress = mainnet.uniswap.pools.usdc_bond;
const router = mainnet.uniswap.router;
const addressWithSeniorAsset = "0x71660c4005BA85c37ccec55d0C4493E66Fe775d3"; //coinbase address
const srAssetSym = "USDC";
const jrAssetSym = "BOND";
const jrInvestedInFull = true;
const srInvestedInFull = false;

class RolloverFixture {
  static init(
    _signers: SignerWithAddress[],
    _allPair: AllPairVault,
    _roll: RolloverVault,
    _strategy: UniswapStrategy
  ) {
    signers = _signers;
    accounts = _signers.map((x) => x.address);
    allPair = _allPair;
    roll = _roll;
    strategy = _strategy;
  }

  static async setPool() {
    //pool = _pool;
    pool = {
      token0: await ethers.getContractAt("IERC20", token0),
      token1: await ethers.getContractAt("IERC20", token1),
      weth: await ethers.getContractAt("IERC20", mainnet.assets.weth),
      router: await ethers.getContractAt("IUniswapV2Router02", router),
      pool: await ethers.getContractAt("IERC20", poolAddress),
      mintAndAdd: async function (
        amt0: BigNumber,
        amt1: BigNumber,
        _to: string,
        signer: SignerWithAddress
      ) {
        logger.debug(`Token0 balance: ${await pool.token0.balanceOf(_to)}`);
        logger.debug(`Token1 balance: ${await pool.token1.balanceOf(_to)}`);
        await pool.token0.connect(signer).approve(router, amt0);
        await pool.token1.connect(signer).approve(router, amt1);
        logger.debug(
          `adding liquidity ${pool.token0.address} ${pool.token1.address} ${_to} ${amt0} ${amt1}`
        );
        await pool.router
          .connect(signer)
          .addLiquidity(
            pool.token0.address,
            pool.token1.address,
            amt0,
            amt1,
            0,
            0,
            _to,
            (await provider.getBlock("latest")).timestamp + 60
          );
        logger.debug(
          `LP balance ${await (
            await ethers.getContractAt("ERC20", poolAddress)
          ).balanceOf(_to)}`
        );
        return await (
          await ethers.getContractAt("ERC20", poolAddress)
        ).balanceOf(_to);
      },
    };
  }

  static createRollover() {
    it("revert: create rollover with invalid vault id", async () => {
      await expect(
        roll.newRollover(0, {
          strategist: accounts[0],
          seniorName: "Rollover Senior",
          seniorSym: srAssetSym,
          juniorName: "Rollover Junior",
          juniorSym: jrAssetSym,
        })
      ).revertedWith("Invalid vaultId");
    });
    it("revert: create rollver with invalid start time", async () => {
      let startTime = (await ethers.provider.getBlock("latest")).timestamp + 3;
      let params: any = {
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime: startTime,
        enrollment: enrollment,
        duration: duration,
        seniorUserCap: srGreaterAmount,
      };
      let id;
      ({ id, params } = await createVault(allPair, params));
      await ethers.provider.send("evm_mine", [startTime + 1]);

      await expect(
        roll.newRollover(id, {
          strategist: accounts[0],
          seniorName: "Rollover Senior",
          seniorSym: "RSR",
          juniorName: "Rollover Junior",
          juniorSym: "RJR",
        })
      ).revertedWith("Invalid start time");
    });
    it("sucess: create rollover", async () => {
      await (strategy as any).setPathJuniorToSenior([
        pool.token1.address,
        pool.token0.address,
      ]);
      await (strategy as any).setPathSeniorToJunior([
        pool.token0.address,
        pool.token1.address,
      ]);
      let params: any = {
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime: (await ethers.provider.getBlock("latest")).timestamp + 1000,
        enrollment: enrollment,
        duration: duration,
        seniorUserCap: srGreaterAmount,
      };
      const { id } = await createVault(allPair, params);

      await roll.newRollover(id, {
        strategist: accounts[0],
        seniorName: "Rollover Senior",
        seniorSym: "RSR",
        juniorName: "Rollover Junior",
        juniorSym: "RJR",
      });
      await expect(
        roll.newRollover(id, {
          strategist: accounts[0],
          seniorName: "Rollover Senior",
          seniorSym: "RSR",
          juniorName: "Rollover Junior",
          juniorSym: "RJR",
        })
      ).to.revertedWith("Already exists");
      await ethers.provider.send("evm_mine", [params.startTime + 1]);

      const encodedRollover = utils.defaultAbiCoder.encode(
        ["address", "address", "address", "uint256"],
        [
          pool.token0.address,
          pool.token1.address,
          strategy.address,
          params.startTime,
        ]
      );
      rollId = BigNumber.from(keccak256(encodedRollover));
      const rolloverObj = await roll.getRollover(rollId);
      srRoll = await ethers.getContractAt(
        "TrancheToken",
        rolloverObj.rolloverTokens[0],
        signers[0]
      );
      jrRoll = await ethers.getContractAt(
        "TrancheToken",
        rolloverObj.rolloverTokens[1],
        signers[1]
      );
      expect((await roll.getRound(rollId, 1)).vaultId).eq(id);
      expect((await allPair.getVaultById(id)).startAt).eq(params.startTime);
    });
    this.printState(7);
  }

  static async srUserDeposit(signer: SignerWithAddress, amount: BigNumber) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addressWithSeniorAsset],
    });
    const signerWithSeniorAsset = await ethers.getSigner(
      addressWithSeniorAsset
    );
    const tokenContract = pool.token0;
    await tokenContract
      .connect(signerWithSeniorAsset)
      .transfer(signer.address, amount);
    await tokenContract.connect(signer).approve(roll.address, amount);
    await roll.connect(signer).deposit(rollId, 0, amount);
  }

  static async jrUserDeposit(
    signer: SignerWithAddress,
    signerNumber: number,
    amount: BigNumber
  ) {
    const routerContract = await ethers.getContractAt(
      "IUniswapV2Router02",
      router
    );
    logger.debug(`Trying to swap ${ethRequiredToGetJrAsset} eth to get weth`);
    await swapEthtoWeth(signer, signerNumber, ethRequiredToGetJrAsset);
    logger.debug(
      `Trying to swap ${ethRequiredToGetJrAsset} eth to get ${amount.div(
        e18.toString()
      )} ${jrAssetSym}`
    );
    await pool.weth
      .connect(signer)
      .approve(
        routerContract.address,
        ethers.BigNumber.from(ethRequiredToGetJrAsset).mul(e18.toString())
      );
    await routerContract
      .connect(signer)
      .swapETHForExactTokens(
        amount,
        [mainnet.assets.weth, token1],
        signer.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: ethers.BigNumber.from(ethRequiredToGetJrAsset)
            .mul(e18.toString())
            .toString(),
        }
      );
    logger.debug(
      `Balance of ${jrAssetSym} in signer${signerNumber} is ${await pool.token1.balanceOf(
        signer.address
      )}`
    );
    const tokenContract = pool.token1;
    await tokenContract.connect(signer).approve(roll.address, amount);
    await roll.connect(signer).deposit(rollId, 1, amount);
  }

  static async srUserAllocate(
    signer: SignerWithAddress,
    signerNumber: number,
    amount: BigNumber
  ) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addressWithSeniorAsset],
    });
    const signerWithSeniorAsset = await ethers.getSigner(
      addressWithSeniorAsset
    );
    const tokenContract = pool.token0;
    await tokenContract
      .connect(signerWithSeniorAsset)
      .transfer(signer.address, amount);
    logger.debug(
      `Balance of token0 in signer${signerNumber} is ${await pool.token0.balanceOf(
        signer.address
      )}`
    );
  }

  static async jrUserAllocate(
    signer: SignerWithAddress,
    signerNumber: number,
    amount: BigNumber
  ) {
    const routerContract = await ethers.getContractAt(
      "IUniswapV2Router02",
      router
    );
    logger.debug(`Trying to swap 5 eth to get weth`);
    await swapEthtoWeth(signer, signerNumber, 5);
    logger.debug(
      `Trying to swap 1 eth to get ${amount.div(e18.toString())} bond`
    );
    let response = await routerContract
      .connect(signer)
      .swapETHForExactTokens(
        amount,
        [mainnet.assets.weth, token1],
        signer.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.toString(),
        }
      );
    logger.debug(
      `Balance of token1 in signer${signerNumber} is ${await pool.token1.balanceOf(
        signer.address
      )}`
    );
  }

  static deposit() {
    it("success: deposit senior asset", async function () {
      await RolloverFixture.srUserDeposit(signers[0], srAmountIn);
      await RolloverFixture.srUserDeposit(signers[1], srAmountIn);
      await RolloverFixture.srUserDeposit(signers[2], srAmountIn);
    });
    it("success: deposit junior asset", async function () {
      await RolloverFixture.jrUserDeposit(signers[3], 3, jrAmountIn);
      await RolloverFixture.jrUserDeposit(signers[4], 4, amountToMint);
      await RolloverFixture.jrUserDeposit(signers[5], 5, amountToMint);
    });
    it("revert: deposit with invalid rollover id", async () => {
      await expect(roll.deposit(rollId.add(1), 0, srAmountIn)).revertedWith(
        "No Vault to deposit in yet"
      );
    });
    it("revert: deposit exceeds senior user cap", async function () {
      await expect(
        RolloverFixture.srUserDeposit(
          signers[2],
          BigNumber.from(srGreaterAmount)
        )
      ).revertedWith("Deposit amount exceeds user cap");
    });
    this.printState(7);
  }

  static singleAllocate(signerIndex: number, tranche: 0 | 1) {
    it("success: single deposit", async function () {
      if (tranche === 0) {
        await RolloverFixture.srUserAllocate(
          signers[signerIndex],
          signerIndex,
          srAmountIn
        );
      } else {
        await RolloverFixture.jrUserAllocate(
          signers[signerIndex],
          signerIndex,
          jrAmountIn
        );
      }
    });
    this.printState(7);
  }

  static singleDeposit(signerIndex: number, tranche: 0 | 1) {
    it("success: single deposit", async function () {
      if (tranche === 0) {
        await RolloverFixture.srUserDeposit(signers[signerIndex], srAmountIn);
      } else {
        await RolloverFixture.jrUserDeposit(
          signers[signerIndex],
          signerIndex,
          jrAmountIn
        );
      }
    });
    this.printState(7);
  }

  static addNextVault() {
    it("revert: add vault with invalid tranche assets", async () => {
      const nextRound = (await roll.getRollover(rollId)).thisRound.add(1);
      const startTime =
        (
          await get.redeemAt(
            allPair,
            (await roll.getRound(rollId, nextRound)).vaultId
          )
        ).toNumber() - enrollment;
      const invalidVaultParams = {
        ...DEFAULT_VAULT_PARAMS,
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token1.address,
        juniorAsset: pool.token0.address,
        hurdleRate: hurdle,
        startTime,
        enrollment: enrollment,
        duration: duration,
        seniorUserCap: srGreaterAmount,
      };
      const { id: vaultIdWithInvalidAssets } = await createVault(
        allPair,
        invalidVaultParams
      );
      await expect(
        roll.addNextVault(rollId, vaultIdWithInvalidAssets)
      ).to.revertedWith("Tranche assets do not match");
    });
    it("revert: add vault with invalid start time", async () => {
      const nextRound = (await roll.getRollover(rollId)).thisRound.add(1);
      const startTime =
        (
          await get.redeemAt(
            allPair,
            (await roll.getRound(rollId, nextRound)).vaultId
          )
        ).toNumber() - enrollment;

      const vaultParams = {
        ...DEFAULT_VAULT_PARAMS,
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime: startTime - 1,
        enrollment: enrollment,
        duration: duration,
        seniorUserCap: srGreaterAmount,
      };

      const { id: vaultIdWithInvalidStartTime } = await createVault(
        allPair,
        vaultParams
      );

      await expect(
        roll.addNextVault(rollId, vaultIdWithInvalidStartTime)
      ).to.revertedWith("Rollover migration must be atomic");
    });
    it("success: adds another Vault to rollover tip", async function () {
      await expect(roll.getNextVault(rollId)).to.revertedWith(
        "No next Vault yet"
      );

      const nextRound = (await roll.getRollover(rollId)).thisRound.add(1);
      const startTime =
        (
          await get.redeemAt(
            allPair,
            (await roll.getRound(rollId, nextRound)).vaultId
          )
        ).toNumber() - enrollment;

      const vaultParams = {
        ...DEFAULT_VAULT_PARAMS,
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime,
        enrollment: enrollment,
        duration: duration,
        seniorUserCap: srGreaterAmount,
      };
      const { id: vaultId } = await createVault(allPair, vaultParams);
      await roll.addNextVault(rollId, vaultId);

      await expect(roll.addNextVault(rollId, vaultId)).to.revertedWith(
        "Round Vault already set"
      );

      expect((await roll.getRound(rollId, nextRound.add(1))).vaultId).eq(
        vaultId
      );

      expect(await roll.getNextVault(rollId)).to.equal(vaultId);
    });
    this.printState(7);
  }

  static migrate() {
    it("success: migrate", async function () {
      let currentRoundIndex = (await roll.getRollover(rollId)).thisRound;
      await ethers.provider.send("evm_increaseTime", [enrollment + 1]);
      //await pool.addFees(10000);
      await roll.migrate(rollId, {
        seniorMinInvest: 0,
        seniorMinRedeem: 0,
        juniorMinInvest: 0,
        juniorMinRedeem: 0,
      });
      currentRoundIndex = (await roll.getRollover(rollId)).thisRound;
      const lastRollData = await roll.getRound(
        rollId,
        currentRoundIndex.sub(1)
      );
      const thisRollData = await roll.getRound(rollId, currentRoundIndex);
      if (currentRoundIndex.gt(1)) {
        const lastLastRollData = await roll.getRound(
          rollId,
          currentRoundIndex.sub(2)
        );
        expect(
          new Decimal(lastRollData.tranches[0].invested.toString())
            .mul(1.1)
            .sub(lastRollData.tranches[0].redeemed.toString())
            .abs()
            .lte(10000)
        ).eq(true);
      }
      await ethers.provider.send("evm_increaseTime", [
        duration - enrollment + 1,
      ]);
      round = round + 1;
      //validating current round
      const rollOverObject = await roll.getRollover(rollId);
      const roundNumber = rollOverObject.thisRound;
      const roundObject = await roll.getRound(rollId, roundNumber);
      const lastRoundObject = await roll.getRound(rollId, roundNumber.sub(1));
      if (jrInvestedInFull) {
        //ratio is in such a way that all the juniors got in
        if (roundNumber.gt(1)) {
          expect(roundObject.tranches[1].newDeposited).eq(
            roundObject.tranches[1].invested.sub(
              lastRoundObject.tranches[1].redeemed
            )
          );
        } else {
          expect(roundObject.tranches[1].newDeposited).eq(
            roundObject.tranches[1].invested
          );
        }

        expect(roundObject.tranches[0].newDeposited).gt(
          roundObject.tranches[0].invested
        );
      }
      if (srInvestedInFull) {
        //ratio is in such a way that all the juniors got in
        if (roundNumber.gt(1)) {
          expect(roundObject.tranches[1].newDeposited).eq(
            roundObject.tranches[1].invested.sub(
              lastRoundObject.tranches[1].redeemed
            )
          );
        } else
          expect(roundObject.tranches[1].newDeposited).gt(
            roundObject.tranches[1].invested
          );
        expect(roundObject.tranches[0].newDeposited).eq(
          roundObject.tranches[0].invested
        );
      }
    });
    this.printState(7);
  }

  static async printState(signersCount: number) {
    it("validate and print: state", async function () {
      const rollOverObject = await roll.getRollover(rollId);
      const roundNumber = rollOverObject.thisRound;
      const roundObject = await roll.getRound(rollId, roundNumber);
      for (let signerCount = 0; signerCount < signersCount; signerCount++) {
        for (let tranche = 0; tranche < 2; tranche++) {
          logger.debug(
            `shares of signer${signerCount} tranche${tranche}: shares: ${
              (
                await roll.getUpdatedInvestor(
                  signers[signerCount].address,
                  rollId,
                  tranche
                )
              ).shares
            } excess: ${
              (
                await roll.getUpdatedInvestor(
                  signers[signerCount].address,
                  rollId,
                  tranche
                )
              ).excess
            }`
          );
        }
      }
      logger.debug(`roundNumber: ${roundNumber}`);
      logger.debug(`last roundNumber: ${roundNumber.sub(1)}`);
      logger.debug(`next roundNumber: ${roundNumber.add(1)}`);
      logger.debug(`vaultId: ${roundObject.vaultId}`);
      if (roundNumber.gt(1)) {
        const lastRoundObject = await roll.getRound(rollId, roundNumber.sub(1));
        logger.debug(
          `lastRound: tranche0 deposited: ${lastRoundObject.tranches[0].deposited}`
        );
        logger.debug(
          `lastRound: tranche0 invested: ${lastRoundObject.tranches[0].invested}`
        );
        logger.debug(
          `lastRound: tranche0 redeemed: ${lastRoundObject.tranches[0].redeemed}`
        );
        logger.debug(
          `lastRound: tranche0 shares: ${lastRoundObject.tranches[0].shares}`
        );
        logger.debug(
          `lastRound: tranche0 newDeposited: ${lastRoundObject.tranches[0].newDeposited}`
        );
        logger.debug(
          `lastRound: tranche0 newInvested: ${lastRoundObject.tranches[0].newInvested}`
        );
        logger.debug(
          `lastRound: tranche1 deposited: ${lastRoundObject.tranches[1].deposited}`
        );
        logger.debug(
          `lastRound: tranche1 invested: ${lastRoundObject.tranches[1].invested}`
        );
        logger.debug(
          `lastRound: tranche1 redeemed: ${lastRoundObject.tranches[1].redeemed}`
        );
        logger.debug(
          `lastRound: tranche1 shares: ${lastRoundObject.tranches[1].shares}`
        );
        logger.debug(
          `lastRound: tranche1 newDeposited: ${lastRoundObject.tranches[1].newDeposited}`
        );
        logger.debug(
          `lastRound: tranche1 newInvested: ${lastRoundObject.tranches[1].newInvested}`
        );
      }
      logger.debug(
        `currentRound: tranche0 deposited: ${roundObject.tranches[0].deposited}`
      );
      logger.debug(
        `currentRound: tranche0 invested: ${roundObject.tranches[0].invested}`
      );
      logger.debug(
        `currentRound: tranche0 redeemed: ${roundObject.tranches[0].redeemed}`
      );
      logger.debug(
        `currentRound: tranche0 shares: ${roundObject.tranches[0].shares}`
      );
      logger.debug(
        `currentRound: tranche0 newDeposited: ${roundObject.tranches[0].newDeposited}`
      );
      logger.debug(
        `currentRound: tranche0 newInvested: ${roundObject.tranches[0].newInvested}`
      );
      logger.debug(
        `currentRound: tranche1 deposited: ${roundObject.tranches[1].deposited}`
      );
      logger.debug(
        `currentRound: tranche1 invested: ${roundObject.tranches[1].invested}`
      );
      logger.debug(
        `currentRound: tranche1 redeemed: ${roundObject.tranches[1].redeemed}`
      );
      logger.debug(
        `currentRound: tranche1 shares: ${roundObject.tranches[1].shares}`
      );
      logger.debug(
        `currentRound: tranche1 newDeposited: ${roundObject.tranches[1].newDeposited}`
      );
      logger.debug(
        `currentRound: tranche1 newInvested: ${roundObject.tranches[1].newInvested}`
      );

      //next round
      const nextRoundObject = await roll.getRound(rollId, roundNumber.add(1));
      logger.debug(
        `nextRound: tranche0 deposited: ${nextRoundObject.tranches[0].deposited}`
      );
      logger.debug(
        `nextRound: tranche0 invested: ${nextRoundObject.tranches[0].invested}`
      );
      logger.debug(
        `nextRound: tranche0 redeemed: ${nextRoundObject.tranches[0].redeemed}`
      );
      logger.debug(
        `nextRound: tranche0 shares: ${nextRoundObject.tranches[0].shares}`
      );
      logger.debug(
        `nextRound: tranche0 newDeposited: ${nextRoundObject.tranches[0].newDeposited}`
      );
      logger.debug(
        `nextRound: tranche0 newInvested: ${nextRoundObject.tranches[0].newInvested}`
      );
      logger.debug(
        `nextRound: tranche1 deposited: ${nextRoundObject.tranches[1].deposited}`
      );
      logger.debug(
        `nextRound: tranche1 invested: ${nextRoundObject.tranches[1].invested}`
      );
      logger.debug(
        `nextRound: tranche1 redeemed: ${nextRoundObject.tranches[1].redeemed}`
      );
      logger.debug(
        `nextRound: tranche1 shares: ${nextRoundObject.tranches[1].shares}`
      );
      logger.debug(
        `nextRound: tranche1 newDeposited: ${nextRoundObject.tranches[1].newDeposited}`
      );
      logger.debug(
        `nextRound: tranche1 newInvested: ${nextRoundObject.tranches[1].newInvested}`
      );
    });
  }
  static claim(signerIndex: number, tranche: 0 | 1) {
    it("success: claim user tokens and excess", async function () {
      const signer = signers[signerIndex];
      const updatedUser = await roll.getUpdatedInvestor(
        signer.address,
        rollId,
        tranche
      );
      const asset = tranche == 0 ? pool.token0 : pool.token1;
      const rolloverToken = tranche == 0 ? srRoll : jrRoll;
      const rollTokensBefore = await rolloverToken.balanceOf(signer.address);
      const assetBefore = await asset.balanceOf(signer.address);
      await roll.connect(signer).claim(rollId, tranche);
      const rollTokensAfter = await rolloverToken.balanceOf(signer.address);
      const assetAfter = await asset.balanceOf(signer.address);
      expect(rollTokensAfter).eq(updatedUser.shares.add(rollTokensBefore));
      expect(assetAfter).eq(updatedUser.excess.add(assetBefore));
    });
    this.printState(7);
  }

  static withdraw(signerIndex: number, tranche: 0 | 1) {
    it("revert: withdraw zero amount", async () => {
      await expect(roll.withdraw(rollId, tranche, 0)).revertedWith(
        "No zero value"
      );
    });
    it("success: withdraw", async function () {
      const signer = signers[signerIndex];
      const updatedUser = await roll.getUpdatedInvestor(
        signer.address,
        rollId,
        tranche
      );
      const asset = tranche == 0 ? pool.token0 : pool.token1;
      const rolloverToken = tranche == 0 ? srRoll : jrRoll;
      const vaultId = (
        await roll.getRound(rollId, (await roll.getRollover(rollId)).thisRound)
      ).vaultId;
      const trancheToken = await ethers.getContractAt(
        "TrancheToken",
        (await allPair.getVaultById(vaultId)).assets[tranche].trancheToken,
        signers[0]
      );
      const rollTokensBefore = await rolloverToken.balanceOf(signer.address);
      const assetBefore = await asset.balanceOf(signer.address);
      const trancheBefore = await trancheToken.balanceOf(signer.address);
      //let amount = tranche===0 ? srAmountIn : jrAmountIn;
      let amount = (
        await roll.getUpdatedInvestor(signer.address, rollId, tranche)
      ).shares;
      logger.debug(`amount: ${amount}`);
      await roll.connect(signer).withdraw(rollId, tranche, amount);
      const rollTokensAfter = await rolloverToken.balanceOf(signer.address);
      const assetAfter = await asset.balanceOf(signer.address);
      const trancheAfter = await trancheToken.balanceOf(signer.address);
      logger.debug(`Signer${signerIndex} rollTokensAfter: ${rollTokensAfter}`);
      logger.debug(`assetAfter: ${assetAfter}`);
      logger.debug(`trancheAfter: ${trancheAfter}`);
      expect(rollTokensBefore).to.lte(rollTokensAfter);
      expect(assetBefore).to.lte(assetAfter);
      expect(trancheBefore).to.lte(trancheAfter);
    });
    this.printState(7);
  }

  static depositLp(signerIndex: number) {
    it(`success: deposit LP tokens mid-duration with signer ${signerIndex}`, async function () {
      const signer = signers[signerIndex];
      const srAmountIn = e6.toFixed();
      const jrAmountIn = e18.toFixed();
      const lp = await pool.mintAndAdd(
        srAmountIn,
        jrAmountIn,
        signer.address,
        signer
      );

      const vaultId = (
        await roll.getRound(rollId, (await roll.getRollover(rollId)).thisRound)
      ).vaultId;
      const vaultData = await allPair.getVaultById(vaultId);
      const srERC20 = TrancheToken__factory.connect(
        vaultData.assets[0].trancheToken,
        signer
      );
      const jrERC20 = TrancheToken__factory.connect(
        vaultData.assets[1].trancheToken,
        signer
      );
      await pool.pool.connect(signer).approve(roll.address, lp);
      const sharesBefore = (await strategy.vaults(vaultId)).shares;
      const [lpBefore] = await strategy.lpFromShares(vaultId, sharesBefore);
      const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
        srERC20.balanceOf(roll.address),
        jrERC20.balanceOf(roll.address),
      ]);
      const seniorTotalBefore = new Decimal(
        vaultData.assets[0].totalInvested.toString()
      );
      const juniorTotalBefore = new Decimal(
        vaultData.assets[1].totalInvested.toString()
      );
      const [shares] = await strategy.sharesFromLp(vaultId, lp);
      const seniorInvestedBefore = (
        await roll.getRound(rollId, (await roll.getRollover(rollId)).thisRound)
      ).tranches[0].invested;
      const juniorInvestedBefore = (
        await roll.getRound(rollId, (await roll.getRollover(rollId)).thisRound)
      ).tranches[1].invested;

      await roll.connect(signer).depositLp(rollId, lp);

      const sharesAfter = (await strategy.vaults(vaultId)).shares;
      const [lpAfter] = await strategy.lpFromShares(vaultId, sharesAfter);
      const seniorExpected = shares
        .mul(seniorTotalBefore.toString())
        .div(sharesBefore.toString());

      const juniorExpected = shares
        .mul(juniorTotalBefore.toString())
        .div(sharesBefore.toString());

      const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
        srERC20.balanceOf(roll.address),
        jrERC20.balanceOf(roll.address),
      ]);
      const seniorInvestedAfter = (
        await roll.getRound(rollId, (await roll.getRollover(rollId)).thisRound)
      ).tranches[0].invested;
      const juniorInvestedAfter = (
        await roll.getRound(rollId, (await roll.getRollover(rollId)).thisRound)
      ).tranches[1].invested;

      expect(lpAfter.sub(lpBefore.add(lp.toString())).abs().lt(1000)).eq(true);
      expect(
        sharesAfter.sub(sharesBefore.add(shares.toString())).abs().lt(1000)
      ).eq(true);
      expect(
        seniorBalanceAfter
          .sub(seniorBalanceBefore.add(seniorExpected))
          .abs()
          .lt(1000)
      ).eq(true);
      expect(
        juniorBalanceAfter
          .sub(juniorBalanceBefore.add(juniorExpected))
          .abs()
          .lt(1000)
      ).eq(true);
      expect(
        juniorInvestedAfter
          .sub(juniorInvestedBefore.add(juniorExpected))
          .abs()
          .lt(1000)
      ).eq(true);
      expect(
        seniorInvestedAfter
          .sub(seniorInvestedBefore.add(seniorExpected))
          .abs()
          .lt(1000)
      ).eq(true);
    });
    this.printState(7);
  }

  static withdrawLp(signerIndex: number) {
    it(`success: withdraw LP mid-duration with signer ${signerIndex}`, async function () {
      const signer = signers[signerIndex];
      const vaultId = (
        await roll.getRound(rollId, (await roll.getRollover(rollId)).thisRound)
      ).vaultId;
      const vaultData = await allPair.getVaultById(vaultId);
      const srERC20 = TrancheToken__factory.connect(
        vaultData.assets[0].trancheToken,
        signer
      );
      const jrERC20 = TrancheToken__factory.connect(
        vaultData.assets[1].trancheToken,
        signer
      );
      const rollover = await roll.getRollover(rollId);
      const srRollover = TrancheToken__factory.connect(
        rollover.rolloverTokens[0],
        signer
      );
      const jrRollover = TrancheToken__factory.connect(
        rollover.rolloverTokens[1],
        signer
      );

      const sharesBefore = (await strategy.vaults(vaultId)).shares;
      const [lpBefore] = await strategy.lpFromShares(vaultId, sharesBefore);
      const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
        srRollover.balanceOf(signer.address),
        jrRollover.balanceOf(signer.address),
      ]);
      const seniorTotalBefore = vaultData.assets[0].totalInvested;
      const juniorTotalBefore = vaultData.assets[1].totalInvested;

      const stratVaultData = await strategy.vaults(vaultId);

      const sharesToWithdraw = seniorBalanceBefore
        .mul(stratVaultData.shares.toString())
        .div(seniorTotalBefore);

      const [lpToWithdraw] = await strategy.lpFromShares(
        vaultId,
        sharesToWithdraw
      );

      await roll.connect(signer).withdrawLp(rollId, lpToWithdraw);

      const sharesAfter = (await strategy.vaults(vaultId)).shares;
      const [lpAfter] = await strategy.lpFromShares(vaultId, sharesAfter);
      const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
        srRollover.balanceOf(signer.address),
        jrRollover.balanceOf(signer.address),
      ]);

      const seniorToBurn = lpToWithdraw
        .mul(seniorTotalBefore)
        .div(sharesBefore);
      const juniorToBurn = lpToWithdraw
        .mul(juniorTotalBefore)
        .div(sharesBefore);

      expect(lpAfter.sub(lpBefore.sub(lpToWithdraw)).abs().lt(1000)).eq(true);
      expect(
        seniorBalanceAfter
          .sub(seniorBalanceBefore.sub(seniorToBurn))
          .abs()
          .lt(1000)
      ).eq(true);
      expect(
        juniorBalanceAfter
          .sub(juniorBalanceBefore.sub(juniorToBurn))
          .abs()
          .lt(1000)
      ).eq(true);
    });
    this.printState(7);
  }
}

export { RolloverFixture };
