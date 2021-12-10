import { expect } from "chai";
import { ethers } from "hardhat";
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

let signers: SignerWithAddress[];
let accounts: string[];

let allPair: AllPairVault;
let pool: UniPoolMock;
let roll: RolloverVault;
let strategy: UniswapStrategy;
let srRoll: TrancheToken;
let jrRoll: TrancheToken;

let rollId: BigNumber;
let round = 0;

const e18 = new Decimal(10).pow(18);
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;
const amountIn = BigNumber.from(e18.times(3).toFixed());
const greaterAmount = BigNumber.from(e18.times(4.5).toFixed());

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

  static setPool(_pool: UniPoolMock) {
    pool = _pool;
  }

  static createRollover() {
    it("revert: create rollover with invalid vault id", async () => {
      await expect(
        roll.newRollover(0, {
          strategist: accounts[0],
          seniorName: "Rollover Senior",
          seniorSym: "RSR",
          juniorName: "Rollover Junior",
          juniorSym: "RJR",
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
        seniorUserCap: greaterAmount,
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
        seniorUserCap: greaterAmount,
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
  }

  static async userDeposit(
    signer: SignerWithAddress,
    tranche: 0 | 1,
    amount: BigNumber
  ) {
    const token: ERC20Mock = (<any>pool)["token" + tranche];
    await token.mint(signer.address, amount);
    await token.connect(signer).approve(roll.address, amount);
    await roll.connect(signer).deposit(rollId, tranche, amount);
  }

  static deposit() {
    it("success: deposit senior asset", async function () {
      await RolloverFixture.userDeposit(signers[0], 0, amountIn);
      await RolloverFixture.userDeposit(signers[1], 0, amountIn);
      await RolloverFixture.userDeposit(signers[2], 0, greaterAmount);
    });
    it("success: deposit junior asset", async function () {
      const amountToMint = BigNumber.from(e18.times(15).toFixed());
      await RolloverFixture.userDeposit(signers[3], 1, amountIn);
      await RolloverFixture.userDeposit(signers[4], 1, amountToMint);
      await RolloverFixture.userDeposit(signers[5], 1, amountToMint);
    });
    it("revert: deposit with invalid rollover id", async () => {
      await expect(roll.deposit(rollId.add(1), 0, amountIn)).revertedWith(
        "No Vault to deposit in yet"
      );
    });
    it("revert: deposit exceeds senior user cap", async function () {
      await expect(
        RolloverFixture.userDeposit(signers[2], 0, BigNumber.from(1))
      ).revertedWith("Deposit amount exceeds user cap");
    });
  }

  static singleDeposit(signerIndex: number, tranche: 0 | 1) {
    it("success: single deposit", async function () {
      await RolloverFixture.userDeposit(
        signers[signerIndex],
        tranche,
        amountIn
      );
    });
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
        seniorUserCap: greaterAmount,
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
        seniorUserCap: greaterAmount,
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
        seniorUserCap: greaterAmount,
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
  }

  static migrate() {
    it("success: migrate", async function () {
      let currentRoundIndex = (await roll.getRollover(rollId)).thisRound;
      await ethers.provider.send("evm_increaseTime", [enrollment + 1]);
      await pool.addFees(10000);
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
  }

  static withdraw(signerIndex: number, tranche: 0 | 1) {
    it("revert: withdraw zero amount", async () => {
      await expect(roll.withdraw(rollId, tranche, 0)).revertedWith(
        "No zero value"
      );
    });
    it("revert: withdraw more than shares", async () => {
      const signer = signers[signerIndex];
      await expect(
        roll.connect(signer).withdraw(rollId, tranche, amountIn.mul(2))
      ).revertedWith("ERC20: burn amount exceeds balance");
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
      await roll.connect(signer).withdraw(rollId, tranche, amountIn);
      const rollTokensAfter = await rolloverToken.balanceOf(signer.address);
      const assetAfter = await asset.balanceOf(signer.address);
      const trancheAfter = await trancheToken.balanceOf(signer.address);

      expect(rollTokensBefore).to.lte(rollTokensAfter);
      expect(assetBefore).to.lte(assetAfter);
      expect(trancheBefore).to.lte(trancheAfter);
    });
  }

  static depositLp(signerIndex: number) {
    it(`success: deposit LP tokens mid-duration with signer ${signerIndex}`, async function () {
      const signer = signers[signerIndex];
      const amountIn = e18.toFixed();
      const lp = await pool.mintAndAdd(amountIn, amountIn, signer.address);

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
  }
}

export { RolloverFixture };
