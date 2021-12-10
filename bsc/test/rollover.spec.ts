import { keccak256 } from "@ethersproject/keccak256";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { BigNumber, utils } from "ethers";
import { deployments, ethers } from "hardhat";
import _ from "lodash";
import {
  createVault,
  DEFAULT_VAULT_PARAMS,
  getVaultId,
  getStrategyName,
} from "./utils/helpers";
import { VaultParams } from "../../scripts/utils/params";
import {
  AllPairVault,
  ERC20Mock,
  IERC20,
  IUniswapV2Router02,
  Registry,
  //RolloverVault,
  TrancheToken,
  UniswapStrategy,
} from "../../typechain";
import { getAmmAddresses } from "./utils/addresses";
import * as get from "../../test/utils/getters";
import { UniPoolMock } from "./utils/uni";

use(solidity);

const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);
const { provider } = ethers;
const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;
const greaterAmount = BigNumber.from(e18.times(4.5).toFixed());
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

interface SignerDeposits {
  [address: string]: {
    deposit: BigNumber;
    prefixSum: BigNumber;
    invested: BigNumber;
    excess: BigNumber;
    redeemed: BigNumber;
    result: BigNumber;
  }[];
}

interface BalancesMap {
  [signerAddr: string]: BigNumber;
}

/*describe("RolloverVault", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let uniswap: IUniswapV2Router02;
  let pool: UniPoolMock;
  let srERC20: TrancheToken;
  let jrERC20: TrancheToken;
  let srRoll: TrancheToken;
  let jrRoll: TrancheToken;
  let roll: RolloverVault;
  let signers: SignerWithAddress[];
  let accounts: string[];
  let vaultId: BigNumber;
  let rollId: BigNumber;
  let lp: Decimal;
  let amountIn: BigNumber;
  // let signerDeposits: {
  //   0: SignerDeposits;
  //   1: SignerDeposits;
  // };
  // let expectedTotalDeposited: {
  //   0: BigNumber[];
  //   1: BigNumber[];
  // };
  // let expectedTotalInvested: {
  //   0: BigNumber[];
  //   1: BigNumber[];
  // };
  // let totalRedeemed: {
  //   0: BigNumber[];
  //   1: BigNumber[];
  // };
  let srDepositors: SignerWithAddress[];
  let jrDepositors: SignerWithAddress[];
  let midTermWithdrawSigner: SignerWithAddress;
  let round: number = 0;
  let router: string;
  let strategyName: string;

  strategyName = getStrategyName();

  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    midTermWithdrawSigner = signers[6];
    //await deployments.fixture([strategyName, "RolloverVault"]);
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract(strategyName);
    registry = await ethers.getContract("Registry");
    //roll = await ethers.getContract("RolloverVault");

    await registry.enableTokens();
  });
  async function setup() {
    router = getAmmAddresses().router;
    pool = await UniPoolMock.createMock(
      signers[0],
      router,
      BigNumber.from(stre18),
      BigNumber.from(stre18)
    );
    uniswap = pool.router;
    amountIn = BigNumber.from(e18.times(3).toFixed());
    // signerDeposits = { 0: {}, 1: {} };
    // expectedTotalDeposited = {
    //   0: [BigNumber.from(0)],
    //   1: [BigNumber.from(0)],
    // };
    // expectedTotalInvested = {
    //   0: [BigNumber.from(0)],
    //   1: [BigNumber.from(0)],
    // };
    // totalRedeemed = {
    //   0: [BigNumber.from(0)],
    //   1: [BigNumber.from(0)],
    // };
    srDepositors = signers.slice(0, 3);
    jrDepositors = signers.slice(3, 6);
  }
  //   async function redeem() {
  //     await vault.redeem(vaultId, 0, 0);
  //     totalRedeemed[0] = await vault.seniorReceived(vaultId);
  //     totalRedeemed[1] = await vault.juniorReceived(vaultId);
  //     computeUsersRedeemed();
  //     const seniorInvested = await vault.seniorInvested(vaultId);
  //     expect(seniorInvested.toString()).equal(expectedTotalInvested[0]);
  //     const juniorInvested = await vault.juniorInvested(vaultId);
  //     expect(juniorInvested.toString()).equal(expectedTotalInvested[1]);
  //   }
  async function rollUserDeposit(
    signer: SignerWithAddress,
    tranche: 0 | 1,
    amount: BigNumber
  ) {
    const token: ERC20Mock = (<any>pool)["token" + tranche];
    await token.mint(signer.address, amount);
    await token.connect(signer).approve(roll.address, amount);
    // expectedTotalDeposited[tranche][round] = expectedTotalDeposited[tranche][
    //   round
    // ].add(amount);
    // if (!signerDeposits[tranche][signer.address]) {
    //   signerDeposits[tranche][signer.address] = [];
    // }
    // signerDeposits[tranche][signer.address][round] = {
    //   prefixSum: expectedTotalDeposited[tranche][round],
    //   deposit: amount,
    //   invested: BigNumber.from(0),
    //   excess: BigNumber.from(0),
    //   redeemed: BigNumber.from(0),
    //   result: BigNumber.from(0),
    // };
    await roll.connect(signer).deposit(rollId, tranche, amount);
  }
  // function rollComputeExpectedTotalInvested() {
  //   if (
  //     expectedTotalDeposited[0][round].gte(expectedTotalDeposited[1][round])
  //   ) {
  //     expectedTotalInvested[0][round] = expectedTotalDeposited[1][round];
  //     expectedTotalInvested[1][round] = expectedTotalDeposited[1][round];
  //   } else {
  //     expectedTotalInvested[0][round] = expectedTotalDeposited[0][round];
  //     expectedTotalInvested[1][round] = expectedTotalDeposited[0][round];
  //   }
  // }
  // function rollComputeExpectedUsersInvestedByTranche(tranche: 0 | 1) {
  //   const total = expectedTotalInvested[tranche][round];
  //   signerDeposits[tranche] = _.transform(
  //     signerDeposits[tranche],
  //     (acc: SignerDeposits, val, key) => {
  //       // n.b. lazy, only works with one deposit
  //       acc[key] = val;
  //       const diff = total.sub(val[round].prefixSum.sub(val[round].deposit));
  //       if (diff.gte(val[round].deposit)) {
  //         acc[key][round].invested = val[round].deposit;
  //       } else if (diff.gt(0)) {
  //         acc[key][round].invested = diff;
  //         acc[key][round].excess = val[round].deposit.sub(diff);
  //       } else {
  //         acc[key][round].excess = val[round].deposit;
  //       }
  //     },
  //     {}
  //   );
  // }
  // function rollComputeExpectedUsersInvested() {
  //   rollComputeExpectedUsersInvestedByTranche(0);
  //   rollComputeExpectedUsersInvestedByTranche(1);
  // }

  // function rollComputeUsersRedeemedByTranche(tranche: 0 | 1) {
  //   const _totalInvested = new Decimal(
  //     expectedTotalInvested[tranche][round].toString()
  //   );
  //   const _totalRedeemed = new Decimal(
  //     totalRedeemed[tranche][round].toString()
  //   );
  //   signerDeposits[tranche] = _.transform(
  //     signerDeposits[tranche],
  //     (acc: SignerDeposits, val, key) => {
  //       acc[key] = val;
  //       acc[key][round].redeemed = BigNumber.from(
  //         _totalRedeemed
  //           .mul(val[round].invested.toString())
  //           .div(_totalInvested)
  //           .toFixed(0)
  //       );
  //       acc[key][round].result = val[round].excess.add(
  //         acc[key][round].redeemed
  //       );
  //     },
  //     {}
  //   );
  // }
  // function rollComputeUsersRedeemed() {
  //   rollComputeUsersRedeemedByTranche(0);
  //   rollComputeUsersRedeemedByTranche(1);
  // }
  async function getBalances(
    token: IERC20,
    signers: SignerWithAddress[]
  ): Promise<BalancesMap> {
    const balances = await Promise.all(
      signers.map((s) => token.balanceOf(s.address))
    );
    return _.transform(
      balances,
      (acc: BalancesMap, val, key) => {
        acc[signers[key].address] = val;
      },
      {}
    );
  }
  function rollDeposit() {
    it("deposit senior asset", async function () {
      await rollUserDeposit(signers[0], 0, amountIn);
      await rollUserDeposit(signers[1], 0, amountIn);
      await rollUserDeposit(signers[2], 0, greaterAmount);
    });
    it("deposit exceeds senior user cap", async function () {
      await expect(
        rollUserDeposit(signers[2], 0, BigNumber.from(1))
      ).revertedWith("Deposit amount exceeds user cap");
    });
    it("deposit junior asset", async function () {
      const amountToMint = BigNumber.from(e18.times(15).toFixed());
      await rollUserDeposit(signers[3], 1, amountIn);
      await rollUserDeposit(signers[4], 1, amountToMint);
      await rollUserDeposit(signers[5], 1, amountToMint);
    });
  }
  function depositOnce(signerIndex: number, tranche: 0 | 1) {
    it("single deposit", async function () {
      await rollUserDeposit(signers[signerIndex], tranche, amountIn);
    });
  }
  function createRollover() {
    it("create rollover", async function () {
      const startTime = (await provider.getBlock("latest")).timestamp + 3;
      const vaultParams = {
        ...DEFAULT_VAULT_PARAMS,
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
      await roll.connect(signers[0]).newRollover(0, {
        vault: vaultParams,
        strategist: accounts[0],
        seniorName: "Rollover Senior",
        seniorSym: "RSR",
        juniorName: "Rollover Junior",
        juniorSym: "RJR",
      });
      await provider.send("evm_mine", [startTime]);
      const investAt = startTime + enrollment;
      const redeemAt = investAt + duration;
      vaultId = getVaultId([
        pool.token0.address,
        pool.token1.address,
        strategy.address,
        hurdle,
        startTime,
        investAt,
        redeemAt,
      ]);
      const encodedRollover = utils.defaultAbiCoder.encode(
        ["address", "address", "address", "uint256"],
        [pool.token0.address, pool.token1.address, strategy.address, startTime]
      );
      rollId = BigNumber.from(keccak256(encodedRollover));
      const vaultObj = await vault.getVaultById(vaultId);
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
      const rolloverObj = await roll.rollover(rollId);
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
      const firstRound = await roll.round(rollId, 1);
      expect(rolloverObj.strategist).eq(accounts[0]);
      expect(rolloverObj.assets[0]).eq(pool.token0.address);
      expect(rolloverObj.assets[1]).eq(pool.token1.address);
      expect(rolloverObj.thisRound).eq(0);
      expect(await srRoll.symbol()).eq("RSR");
      expect(await srRoll.name()).eq("Rollover Senior");
      expect(await jrRoll.symbol()).eq("RJR");
      expect(await jrRoll.name()).eq("Rollover Junior");
      expect(firstRound.vaultId).eq(vaultId);
    });
    it("create rollover from existing Vault", async function () {
      let startTime = (await provider.getBlock("latest")).timestamp + 3;
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
      let investAt;
      let redeemAt;
      let id;
      ({ id, investAt, redeemAt, params } = await createVault(vault, params));
      await provider.send("evm_mine", [startTime + 1]);
      await expect(
        roll.newRollover(id, {
          vault: params,
          strategist: accounts[0],
          seniorName: "Rollover Senior",
          seniorSym: "RSR",
          juniorName: "Rollover Junior",
          juniorSym: "RJR",
        })
      ).revertedWith("Invalid start time");
      params.startTime = (await provider.getBlock("latest")).timestamp + 1000;
      ({ id, investAt, redeemAt, params } = await createVault(vault, params));
      await roll.newRollover(id, {
        vault: {
          ...params,
          strategy: accounts[9],
          startTime: startTime + 1000,
        },
        strategist: accounts[0],
        seniorName: "Rollover Senior",
        seniorSym: "RSR",
        juniorName: "Rollover Junior",
        juniorSym: "RJR",
      });
      const encodedRollover = utils.defaultAbiCoder.encode(
        ["address", "address", "address", "uint256"],
        [
          pool.token0.address,
          pool.token1.address,
          strategy.address,
          params.startTime,
        ]
      );
      const rolloverId = BigNumber.from(keccak256(encodedRollover));
      expect((await roll.round(rolloverId, 1)).vaultId).eq(id);
      expect((await vault.getVaultById(id)).startAt).eq(params.startTime);
    });
  }
  function addNextVault(existing: boolean) {
    it("adds another Vault to rollover tip", async function () {
      const vaultParams = {
        ...DEFAULT_VAULT_PARAMS,
        strategy: strategy.address,
        strategist: accounts[0],
        seniorAsset: pool.token0.address,
        juniorAsset: pool.token1.address,
        hurdleRate: hurdle,
        startTime: 0,
        enrollment: enrollment,
        duration: duration,
        seniorUserCap: greaterAmount,
      };
      if (existing) {
        const nextRound = (await roll.currentRoundIndex(rollId)).add(1);
        vaultParams.startTime =
          (
            await get.redeemAt(
              vault,
              (await roll.round(rollId, nextRound)).vaultId
            )
          ).toNumber() - enrollment;
        let vaultId;
        ({ id: vaultId } = await createVault(vault, vaultParams));
        await roll.addNextVault(rollId, vaultId);
        expect((await roll.round(rollId, nextRound.add(1))).vaultId).eq(
          vaultId
        );
      } else {
        await roll.createAndAddNextVault(rollId, vaultParams);
      }
    });
  }
  function migrate() {
    it("migrate", async function () {
      let currentRoundIndex = await roll.currentRoundIndex(rollId);
      await provider.send("evm_increaseTime", [enrollment + 1]);
      await pool.addFees(10000);
      await roll.migrate(rollId, {
        seniorMinInvest: 0,
        seniorMinRedeem: 0,
        juniorMinInvest: 0,
        juniorMinRedeem: 0,
      });
      // rollComputeUsersRedeemed();
      currentRoundIndex = await roll.currentRoundIndex(rollId);
      const lastRollData = await roll.round(rollId, currentRoundIndex.sub(1));
      const thisRollData = await roll.currentRound(rollId);
      if (currentRoundIndex.gt(1)) {
        const lastLastRollData = await roll.round(
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
        // expectedTotalDeposited[0][round] = expectedTotalDeposited[0][round]
        //   .add(lastRollData.tranches[0].redeemed)
        //   .add(
        //     lastRollData.tranches[0].deposited.sub(
        //       lastRollData.tranches[0].invested
        //     )
        //   );
        // expectedTotalDeposited[1][round] = expectedTotalDeposited[1][round]
        //   .add(lastRollData.tranches[1].redeemed)
        //   .add(
        //     lastRollData.tranches[1].deposited.sub(
        //       lastRollData.tranches[1].invested
        //     )
        //   );
      }
      await provider.send("evm_increaseTime", [duration - enrollment + 1]);
      // invested compute doesn't quite work because reserves change
      // rollComputeExpectedUsersInvested();
      //   expect(thisRollData.tranches[0].invested).equal(expectedTotalInvested[0]);
      //   expect(thisRollData.tranches[1].invested).equal(expectedTotalInvested[1]);
      // deposit also doesn't quite yet work - need to factor in what new users get in
      // and not
      //   expect(thisRollData.tranches[0].deposited).equal(
      //     expectedTotalDeposited[0]
      //   );
      //   expect(thisRollData.tranches[1].deposited).equal(
      //     expectedTotalDeposited[1]
      //   );
      round++;
      // expectedTotalDeposited[0][round] = BigNumber.from(0);
      // expectedTotalInvested[0][round] = BigNumber.from(0);
      // expectedTotalDeposited[1][round] = BigNumber.from(0);
      // expectedTotalInvested[1][round] = BigNumber.from(0);
    });
  }
  function claim(signerIndex: number, tranche: 0 | 1) {
    it("claim user tokens and excess", async function () {
      const signer = signers[signerIndex];
      const updatedUser = await roll.getUpdatedInvestor(
        signer.address,
        rollId,
        tranche
      );
      // const expectedExcess = signerDeposits[tranche][signer.address]
      //   .map((deposit) => deposit.excess)
      //   .reduce((acc, val) => {
      //     return acc.add(val);
      //   });
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
  function withdraw(signerIndex: number, tranche: 0 | 1) {
    it("withdraw", async function () {
      const signer = signers[signerIndex];
      const updatedUser = await roll.getUpdatedInvestor(
        signer.address,
        rollId,
        tranche
      );
      const asset = tranche == 0 ? pool.token0 : pool.token1;
      const rolloverToken = tranche == 0 ? srRoll : jrRoll;
      const vaultId = (
        await roll.round(rollId, await roll.currentRoundIndex(rollId))
      ).vaultId;
      const trancheToken = await ethers.getContractAt(
        "TrancheToken",
        (await vault.getVaultById(vaultId)).assets[tranche].trancheToken,
        signers[0]
      );
      const rollTokensBefore = await rolloverToken.balanceOf(signer.address);
      const assetBefore = await asset.balanceOf(signer.address);
      const trancheBefore = await trancheToken.balanceOf(signer.address);
      await roll.connect(signer).withdraw(rollId, tranche, amountIn);
      const assetAfter = await asset.balanceOf(signer.address);
      const rolloverTokensAfter = await rolloverToken.balanceOf(signer.address);
      const trancheAfter = await trancheToken.balanceOf(signer.address);
      // expect(trancheAfter).eq(amountIn.add(trancheBefore));
      // expect(assetAfter).eq(updatedUser.excess.add(assetBefore));
      // expect(rolloverTokensAfter).eq(
      //   rollTokensBefore.gt(amountIn)
      //     ? updatedUser.shares.add(rollTokensBefore).sub(amountIn)
      //     : updatedUser.shares
      // );
    });
  }

  function basicRound() {
    rollDeposit();
    // rollComputeExpectedUsersInvested();
    addNextVault(false);
    migrate();
  }
  function roundWithSingleDeposit(signerIndex: number, tranche: 0 | 1) {
    depositOnce(signerIndex, tranche);
    rollDeposit();
    // rollComputeExpectedUsersInvested();
    addNextVault(false);
    migrate();
  }
  function roundWithClaim(signerIndex: number, tranche: 0 | 1) {
    rollDeposit();
    // rollComputeExpectedUsersInvested();
    addNextVault(false);
    migrate();
    claim(signerIndex, tranche);
  }
  function roundWithWithdrawal(signerIndex: number, tranche: 0 | 1) {
    withdraw(signerIndex, tranche);
    rollDeposit();
    addNextVault(false);
    migrate();
  }
  function roundAddExistingVault() {
    rollDeposit();
    // rollComputeExpectedUsersInvested();
    addNextVault(true);
    migrate();
  }
  function depositAfterClaim() {
    it("doesn't send additional excess on deposit after claiming", async function () {
      roundWithClaim(7, 1);
      roundWithClaim(6, 0);
      const balance0AfterClaim = await pool.token0.balanceOf(
        signers[6].address
      );
      const balance1AfterClaim = await pool.token1.balanceOf(
        signers[7].address
      );
      basicRound();
      roundWithSingleDeposit(7, 1);
      roundWithSingleDeposit(6, 0);
      expect(await pool.token0.balanceOf(signers[6].address)).eq(
        balance0AfterClaim
      );
      expect(await pool.token1.balanceOf(signers[7].address)).eq(
        balance1AfterClaim
      );
    });
  }
  describe("basic rollover", function () {
    before(async function () {
      await setup();
    });
    createRollover();
    basicRound();
    roundWithSingleDeposit(6, 0);
    roundAddExistingVault();
    roundWithSingleDeposit(7, 1);
    basicRound();
    depositAfterClaim();
    roundWithWithdrawal(0, 0);
  });

  //   async function redeem() {
  //     await vault.redeem(vaultId, 0, 0);
  //     totalRedeemed[0] = await vault.seniorReceived(vaultId);
  //     totalRedeemed[1] = await vault.juniorReceived(vaultId);
  //     computeUsersRedeemed();
  //     const seniorInvested = await vault.seniorInvested(vaultId);
  //     expect(seniorInvested.toString()).equal(expectedTotalInvested[0]);
  //     const juniorInvested = await vault.juniorInvested(vaultId);
  //     expect(juniorInvested.toString()).equal(expectedTotalInvested[1]);
  //   }
  //   async function userDeposit(
  //     signer: SignerWithAddress,
  //     tranche: 0 | 1,
  //     amount: BigNumber
  //   ) {
  //     const token: ERC20Mock = (<any>pool)["token" + tranche];
  //     await token.mint(signer.address, amount);
  //     await token.connect(signer).approve(vault.address, amount);
  //     expectedTotalDeposited[tranche] = expectedTotalDeposited[tranche].add(
  //       amount
  //     );
  //     signerDeposits[tranche][signer.address] = {
  //       prefixSum: expectedTotalDeposited[tranche],
  //       deposit: amount,
  //       invested: BigNumber.from(0),
  //       excess: BigNumber.from(0),
  //       redeemed: BigNumber.from(0),
  //       result: BigNumber.from(0),
  //     };

  //     if (expectedTotalDeposited[0].gte(expectedTotalDeposited[1])) {
  //       expectedTotalInvested[0] = expectedTotalDeposited[1];
  //       expectedTotalInvested[1] = expectedTotalDeposited[1];
  //     } else {
  //       expectedTotalInvested[0] = expectedTotalDeposited[0];
  //       expectedTotalInvested[1] = expectedTotalDeposited[0];
  //     }
  //     await vault.connect(signer).deposit(vaultId, tranche, amount);
  //   }
  //   function computeExpectedUsersInvestedByTranche(tranche: 0 | 1) {
  //     const total = expectedTotalInvested[tranche];
  //     signerDeposits[tranche] = _.transform(
  //       signerDeposits[tranche],
  //       (acc: SignerDeposits, val, key) => {
  //         // n.b. lazy, only works with one deposit
  //         acc[key] = val;
  //         const diff = total.sub(val.prefixSum.sub(val.deposit));
  //         if (diff.gte(val.deposit)) {
  //           acc[key].invested = val.deposit;
  //         } else if (diff.gt(0)) {
  //           acc[key].invested = diff;
  //           acc[key].excess = val.deposit.sub(diff);
  //         } else {
  //           acc[key].excess = val.deposit;
  //         }
  //       },
  //       {}
  //     );
  //   }
  //   function computeExpectedUsersInvested() {
  //     computeExpectedUsersInvestedByTranche(0);
  //     computeExpectedUsersInvestedByTranche(1);
  //   }

  //   function computeUsersRedeemedByTranche(tranche: 0 | 1) {
  //     const _totalInvested = new Decimal(
  //       expectedTotalInvested[tranche].toString()
  //     );
  //     const _totalRedeemed = new Decimal(totalRedeemed[tranche].toString());
  //     signerDeposits[tranche] = _.transform(
  //       signerDeposits[tranche],
  //       (acc: SignerDeposits, val, key) => {
  //         acc[key] = val;
  //         acc[key].redeemed = BigNumber.from(
  //           _totalRedeemed
  //             .mul(val.invested.toString())
  //             .div(_totalInvested)
  //             .toFixed(0)
  //         );
  //         acc[key].result = val.excess.add(acc[key].redeemed);
  //       },
  //       {}
  //     );
  //   }
  //   function computeUsersRedeemed() {
  //     computeUsersRedeemedByTranche(0);
  //     computeUsersRedeemedByTranche(1);
  //   }

  //   function getters() {
  //     it("gets Vault by tranche token addresses", async function () {
  //       expect((await vault.getVaultByToken(srERC20.address)).hurdleRate).equal(
  //         hurdle
  //       );
  //       expect((await vault.getVaultByToken(jrERC20.address)).hurdleRate).equal(
  //         hurdle
  //       );
  //     });
  //     it("gets Vault by state", async function () {
  //       expect((await vault.getVaultsByState(1, 0, 1))[0].hurdleRate).equal(hurdle);
  //     });
  //   }
  //   function deposit() {
  //     it("deposit senior asset", async function () {
  //       const greaterAmount = BigNumber.from(e18.times(4.5).toFixed());
  //       await userDeposit(signers[0], 0, amountIn);
  //       await userDeposit(signers[1], 0, amountIn);
  //       await userDeposit(signers[2], 0, greaterAmount);
  //     });
  //     it("deposit junior asset", async function () {
  //       const amountToMint = BigNumber.from(e18.times(15).toFixed());
  //       await userDeposit(signers[3], 1, amountIn);
  //       await userDeposit(signers[4], 1, amountToMint);
  //       await userDeposit(signers[5], 1, amountToMint);
  //     });
  //     it("deposits as expected", async function () {
  //       computeExpectedUsersInvested();
  //       expect(await vault.seniorDeposited(vaultId)).eq(expectedTotalDeposited[0]);
  //       expect(await vault.juniorDeposited(vaultId)).eq(expectedTotalDeposited[1]);
  //       expect(await pool.token0.balanceOf(strategy.address)).eq(
  //         expectedTotalDeposited[0]
  //       );
  //       expect(await pool.token1.balanceOf(strategy.address)).eq(
  //         expectedTotalDeposited[1]
  //       );
  //     });
  //     it("cannot invest too early", async function () {
  //       await expect(vault.invest(vaultId, 0, 0)).revertedWith(
  //         "Not yet time to invest"
  //       );
  //       await provider.send("evm_increaseTime", [enrollment + 1]);
  //     });
  //   }
  //   function invest() {
  //     it("invest assets", async function () {
  //       const nonStrategist = vault.connect(signers[3]);
  //       await expect(nonStrategist.invest(vaultId, 0, 0)).revertedWith(
  //         "Sender must be rollover or strategist"
  //       );
  //       await vault.invest(vaultId, 0, 0);
  //       await expect(vault.invest(vaultId, 0, 0)).revertedWith(
  //         "Cannot transition to Live from current state"
  //       );
  //       await expect(vault.redeem(vaultId, 0, 0)).revertedWith(
  //         "Not yet time to redeem"
  //       );
  //       const seniorInvested = await vault.seniorInvested(vaultId);
  //       expect(seniorInvested.toString()).equal(expectedTotalInvested[0]);
  //       const juniorInvested = await vault.juniorInvested(vaultId);
  //       expect(juniorInvested.toString()).equal(expectedTotalInvested[1]);
  //     });
  //   }
  //   function claim() {
  //     it("claim tranche tokens and excess", async function () {
  //       await Promise.all(
  //         srDepositors.map((s) => vault.connect(s).claim(vaultId, 0))
  //       );

  //       const srBal = await getBalances(pool.token0, srDepositors);
  //       const srTrBal = await getBalances(srERC20, srDepositors);
  //       await Promise.all(
  //         jrDepositors.map((s) => vault.connect(s).claim(vaultId, 1))
  //       );
  //       const jrBal = await getBalances(pool.token1, jrDepositors);
  //       const jrTrBal = await getBalances(jrERC20, jrDepositors);

  //       for (const [address, amount] of _.toPairs(srBal)) {
  //         expect(amount).eq(signerDeposits[0][address].excess);
  //       }

  //       for (const [address, amount] of _.toPairs(jrBal)) {
  //         expect(amount).eq(signerDeposits[1][address].excess);
  //       }

  //       for (const [address, amount] of _.toPairs(srTrBal)) {
  //         expect(amount).eq(signerDeposits[0][address].invested);
  //       }

  //       for (const [address, amount] of _.toPairs(jrTrBal)) {
  //         expect(amount).eq(signerDeposits[1][address].invested);
  //       }
  //     });
  //   }
  //   function withdraw() {
  //     it("withdraw received amounts", async function () {
  //       const firstSenior = srDepositors[0];
  //       const fsb = await srERC20.balanceOf(firstSenior.address);
  //       let _srDepositors = srDepositors;
  //       if (fsb.gt(0)) {
  //         // this hits the case of obtaining tokens without having deposited/claimed
  //         _srDepositors = srDepositors.slice(1);
  //         const specialSigners = [firstSenior, signers[9]];
  //         await srERC20
  //           .connect(firstSenior)
  //           .transfer(signers[9].address, fsb.div(2));
  //         await Promise.all(
  //           specialSigners.map((s) => vault.connect(s).withdraw(vaultId, 0))
  //         );
  //         const bal = await getBalances(pool.token0, specialSigners);
  //         const trBal = await getBalances(srERC20, specialSigners);
  //         for (const amount of _.values(bal)) {
  //           expect(
  //             amount
  //               .sub(signerDeposits[0][firstSenior.address].result.div(2))
  //               .abs()
  //               .lt(100)
  //           ).eq(true);
  //         }
  //         for (const amount of _.values(trBal)) {
  //           expect(amount).eq(0);
  //         }
  //       }
  //       await Promise.all(
  //         _srDepositors.map((s) => vault.connect(s).withdraw(vaultId, 0))
  //       );
  //       await Promise.all(
  //         jrDepositors.map((s) => vault.connect(s).withdraw(vaultId, 1))
  //       );
  //       const srBal = await getBalances(pool.token0, _srDepositors);
  //       const jrBal = await getBalances(pool.token1, jrDepositors);
  //       const srTrBal = await getBalances(srERC20, srDepositors);
  //       const jrTrBal = await getBalances(jrERC20, jrDepositors);
  //       for (const [address, amount] of _.toPairs(srBal)) {
  //         expect(amount.sub(signerDeposits[0][address].result).abs().lt(100)).eq(
  //           true
  //         );
  //       }
  //       for (const [address, amount] of _.toPairs(jrBal)) {
  //         expect(amount.sub(signerDeposits[1][address].result).abs().lt(100)).eq(
  //           true
  //         );
  //       }
  //       for (const amount of _.values(srTrBal)) {
  //         expect(amount).eq(0);
  //       }
  //       for (const amount of _.values(jrTrBal)) {
  //         expect(amount).eq(0);
  //       }
  //     });
  //   }
  //   function depositLP(signerIndex: number) {
  //     it(`deposit LP tokens mid-duration with signer ${signerIndex}`, async function () {
  //       const signer = signers[signerIndex];
  //       const lpBefore = await strategy
  //         .vaults(vaultId)
  //         .then((x) => new Decimal(x.lpTokens.toString()));

  //       const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
  //         srERC20.balanceOf(signer.address),
  //         jrERC20.balanceOf(signer.address),
  //       ]).then((all) => all.map((x) => new Decimal(x.toString())));
  //       const vaultData = await vault.getVaultById(vaultId);

  //       const seniorTotalBefore = new Decimal(
  //         vaultData.assets[0].totalInvested.toString()
  //       );
  //       const juniorTotalBefore = new Decimal(
  //         vaultData.assets[1].totalInvested.toString()
  //       );

  //       const amountIn = e18.toFixed();
  //       let depositLpSrExcess = await pool.token0.balanceOf(pool.minterAddress);
  //       let depositLpJrExcess = await pool.token1.balanceOf(pool.minterAddress);
  //       lp = await pool
  //         .mintAndAdd(amountIn, amountIn, signer.address)
  //         .then((lp) => new Decimal(lp.toString()));
  //       depositLpSrExcess = await pool.token0
  //         .balanceOf(pool.minterAddress)
  //         .then((bal) => bal.sub(depositLpSrExcess));
  //       depositLpJrExcess = await pool.token1
  //         .balanceOf(pool.minterAddress)
  //         .then((bal) => bal.sub(depositLpJrExcess));
  //       if (depositLpSrExcess.gt(0)) {
  //         await pool.token0.burn(pool.minterAddress, depositLpSrExcess);
  //       }
  //       if (depositLpJrExcess.gt(0)) {
  //         await pool.token1.burn(pool.minterAddress, depositLpJrExcess);
  //       }
  //       await pool.pool.connect(signer).approve(vault.address, amountIn);
  //       await vault.connect(signer).depositLp(vaultId, lp.toFixed(0));
  //       const lpAfter = await strategy
  //         .vaults(vaultId)
  //         .then((x) => new Decimal(x.lpTokens.toString()));
  //       expect(lpAfter.eq(lpBefore.add(lp.toString()))).eq(true);
  //       const seniorExpected = lp
  //         .div(lpBefore.toString())
  //         .mul(seniorTotalBefore.toString());
  //       const juniorExpected = lp
  //         .div(lpBefore.toString())
  //         .mul(juniorTotalBefore.toString());
  //       const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
  //         srERC20.balanceOf(signer.address),
  //         jrERC20.balanceOf(signer.address),
  //       ]).then((all) => all.map((x) => new Decimal(x.toString())));
  //       expectedTotalInvested[0] = expectedTotalInvested[0].add(
  //         seniorBalanceAfter.sub(seniorBalanceBefore).toFixed(0)
  //       );
  //       expectedTotalInvested[1] = expectedTotalInvested[1].add(
  //         juniorBalanceAfter.sub(juniorBalanceBefore).toFixed(0)
  //       );
  //       expect(
  //         seniorBalanceAfter
  //           .sub(seniorBalanceBefore.add(seniorExpected))
  //           .abs()
  //           .lt(1000)
  //       ).eq(true);
  //       expect(
  //         juniorBalanceAfter
  //           .sub(juniorBalanceBefore.add(juniorExpected))
  //           .abs()
  //           .lt(1000)
  //       ).eq(true);
  //       await provider.send("evm_increaseTime", [duration / 2]);
  //     });
  //   }
  //   function withdrawLPFromOriginalDeposit() {
  //     it(`withdraw LP mid-duration from original deposits`, async function () {
  //       const srSigner = srDepositors.shift()!;
  //       const jrSigner = jrDepositors.shift()!;
  //       const [seniorBalance, juniorBalance] = await Promise.all([
  //         srERC20.balanceOf(srSigner.address),
  //         jrERC20.balanceOf(jrSigner.address),
  //       ]).then((all) => all.map((x) => new Decimal(x.toString())));
  //       await srERC20
  //         .connect(srSigner)
  //         .transfer(midTermWithdrawSigner.address, seniorBalance.toFixed());
  //       await jrERC20
  //         .connect(jrSigner)
  //         .transfer(midTermWithdrawSigner.address, juniorBalance.toFixed());
  //       const poolInfo = await strategy.vaults(vaultId);
  //       const lpToWithdraw = seniorBalance
  //         .mul(poolInfo.lpTokens.toString())
  //         .div(await vault.seniorInvested(vaultId).then((x) => x.toString()));
  //       await vault
  //         .connect(midTermWithdrawSigner)
  //         .withdrawLp(vaultId, lpToWithdraw.toFixed());
  //       expectedTotalInvested[0] = expectedTotalInvested[0].sub(
  //         seniorBalance.toFixed(0)
  //       );
  //       expectedTotalInvested[1] = expectedTotalInvested[1].sub(
  //         juniorBalance.toFixed(0)
  //       );
  //       expect(await pool.pool.balanceOf(midTermWithdrawSigner.address)).eq(
  //         lpToWithdraw.toFixed(0)
  //       );
  //       expect(
  //         await Promise.all([
  //           srERC20.balanceOf(midTermWithdrawSigner.address),
  //           jrERC20.balanceOf(midTermWithdrawSigner.address),
  //         ]).then((all) => all.every((x) => x.eq(0)))
  //       ).eq(true);
  //     });
  //   }
  //   function withdrawLP(signerIndex: number) {
  //     it(`withdraw LP mid-duration with signer ${signerIndex}`, async function () {
  //       const signer = signers[signerIndex];
  //       const lpBefore = await strategy
  //         .vaults(vaultId)
  //         .then((x) => new Decimal(x.lpTokens.toString()));

  //       const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
  //         srERC20.balanceOf(signer.address),
  //         jrERC20.balanceOf(signer.address),
  //       ]).then((all) => all.map((x) => new Decimal(x.toString())));
  //       const vaultData = await vault.getVaultById(vaultId);

  //       const seniorTotalBefore = new Decimal(
  //         vaultData.assets[0].totalInvested.toString()
  //       );
  //       const juniorTotalBefore = new Decimal(
  //         vaultData.assets[1].totalInvested.toString()
  //       );

  //       await vault.connect(signer).withdrawLp(vaultId, lp.toFixed(0));

  //       const lpAfter = await strategy
  //         .vaults(vaultId)
  //         .then((x) => new Decimal(x.lpTokens.toString()));
  //       const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
  //         srERC20.balanceOf(signer.address),
  //         jrERC20.balanceOf(signer.address),
  //       ]).then((all) => all.map((x) => new Decimal(x.toString())));

  //       const seniorToBurn = lp.div(lpBefore).mul(seniorTotalBefore);
  //       const juniorToBurn = lp.div(lpBefore).mul(juniorTotalBefore);

  //       expectedTotalInvested[0] = expectedTotalInvested[0].sub(
  //         seniorBalanceBefore.sub(seniorBalanceAfter).toFixed(0)
  //       );
  //       expectedTotalInvested[1] = expectedTotalInvested[1].sub(
  //         juniorBalanceBefore.sub(juniorBalanceAfter).toFixed(0)
  //       );

  //       expect(lpAfter.eq(lpBefore.sub(lp))).eq(true);
  //       expect(
  //         seniorBalanceAfter
  //           .sub(seniorBalanceBefore.sub(seniorToBurn))
  //           .abs()
  //           .lt(1000)
  //       ).eq(true);
  //       expect(
  //         juniorBalanceAfter
  //           .sub(juniorBalanceBefore.sub(juniorToBurn))
  //           .abs()
  //           .lt(1000)
  //       ).eq(true);
  //       await provider.send("evm_increaseTime", [duration / 2 + 1]);
  //     });
  //   }
  //   describe("delayed Vault", async function () {
  //     let delayedVaultId: BigNumber;
  //     let investAt: number;
  //     before(async function () {
  //       await setup();
  //     });
  //     it("can only deposit after start time", async function () {
  //       const startTime = (await provider.getBlock("latest")).timestamp + 30;
  //       await pool.mint("zero", amountIn, accounts[0]);
  //       await pool.token0.approve(vault.address, amountIn);

  //       await vault.createVault(
  //         strategy.address,
  //         accounts[0],
  //         pool.token0.address,
  //         pool.token1.address,
  //         hurdle,
  //         startTime,
  //         enrollment,
  //         duration
  //       );
  //       investAt = startTime + enrollment;
  //       const redeemAt = investAt + duration;
  //       const encoded = utils.defaultAbiCoder.encode(
  //         ["address", "address", "address", "uint256", "uint256", "uint256"],
  //         [
  //           pool.token0.address,
  //           pool.token1.address,
  //           strategy.address,
  //           startTime,
  //           investAt,
  //           redeemAt,
  //         ]
  //       );
  //       delayedVaultId = BigNumber.from(keccak256(encoded));
  //       await provider.send("evm_mine", []);
  //       await expect(vault.deposit(delayedVaultId, 0, amountIn)).revertedWith(
  //         "Not yet time to enroll"
  //       );
  //       await provider.send("evm_mine", [startTime]);
  //     });
  //     it("deposits after start time", async function () {
  //       await vault.deposit(delayedVaultId, 0, amountIn);
  //       expect(await vault.seniorDeposited(delayedVaultId)).equal(amountIn);
  //       await pool.mint("one", amountIn, accounts[1]);
  //       await pool.token1.connect(signers[1]).approve(vault.address, amountIn);
  //       await vault.connect(signers[1]).deposit(delayedVaultId, 1, amountIn);
  //       await provider.send("evm_mine", [investAt]);
  //     });
  //     it("can't deposit after investment", async function () {
  //       await vault.invest(delayedVaultId, 0, 0);
  //       await pool.mint("one", amountIn, accounts[6]);
  //       await expect(
  //         vault.connect(signers[6]).deposit(delayedVaultId, 1, amountIn)
  //       ).revertedWith("Invalid operation at current state");
  //     });
  //   });
  //   describe("withdraw midterm LP deposit", async function () {
  //     before(async function () {
  //       await setup();
  //     });
  //     createVault();
  //     deposit();
  //     invest();
  //     depositLP(7);
  //     it("withdraws as expected after depositing LP without claiming", async function () {
  //       await pool.addReserves(e18.mul(500).toFixed(0), e18.mul(500).toFixed(0));
  //       await provider.send("evm_increaseTime", [duration / 2 + 1]);
  //       await redeem();
  //       await vault.connect(signers[7]).withdraw(vaultId, 0);
  //       await vault.connect(signers[7]).withdraw(vaultId, 1);
  //       expect(await srERC20.balanceOf(accounts[7])).equal(0);
  //       expect(await jrERC20.balanceOf(accounts[7])).equal(0);
  //       const seniorWithdrawn = await pool.token0.balanceOf(accounts[7]);
  //       const juniorWithdrawn = await pool.token1.balanceOf(accounts[7]);
  //       expect(seniorWithdrawn).eq(
  //         BigNumber.from(new Decimal(1e18).times(hurdle).div(10000).toFixed(0))
  //       );
  //       expect(juniorWithdrawn).gt(BigNumber.from(10).pow(18));
  //     });
  //     withdraw();
  //   });
  //   describe("sell senior for leveraged junior returns", function () {
  //     before(async function () {
  //       await setup();
  //     });
  //     createVault();
  //     deposit();
  //     getters();
  //     invest();
  //     claim();
  //     withdrawLPFromOriginalDeposit();
  //     depositLP(6);
  //     depositLP(7);
  //     withdrawLP(6);
  //     withdrawLP(7);
  //     it("redeem LP after fee accrual", async function () {
  //       await pool.addReserves(e18.mul(2).toFixed(0), stre18);
  //       const reservesBefore = await pool
  //         .balancesOf(pool.pool.address)
  //         .then((all) => all.map((x) => new Decimal(x.toString())));
  //       const nonStrategist = vault.connect(signers[3]);
  //       await expect(nonStrategist.redeem(vaultId, 0, 0)).revertedWith(
  //         "Sender must be rollover or strategist"
  //       );
  //       await redeem();
  //       await expect(vault.redeem(vaultId, 0, 0)).revertedWith(
  //         "Cannot transition to Withdraw from current state"
  //       );
  //       const seniorReceived = await vault.seniorReceived(vaultId);
  //       const seniorExpected = new Decimal(
  //         (await vault.seniorInvested(vaultId)).toString()
  //       )
  //         .times(1.1)
  //         .toFixed(0);
  //       const juniorReceived = await vault.juniorReceived(vaultId);
  //       const reservesAfter = await pool
  //         .balancesOf(pool.pool.address)
  //         .then((all) => all.map((x) => new Decimal(x.toString())));
  //       expect(
  //         reservesBefore[0]
  //           .div(reservesBefore[1])
  //           .lt(reservesAfter[0].div(reservesAfter[1]))
  //       ).eq(true);
  //       expect(await vault.seniorExpected(vaultId)).eq(seniorExpected);
  //       expect(seniorReceived.toString()).equal(seniorExpected);
  //       expect(juniorReceived.gt(0)).eq(true);
  //     });
  //     withdraw();
  //   });
  //   describe("sell all junior to partially cover senior", function () {
  //     before(async function () {
  //       await setup();
  //     });
  //     createVault();
  //     deposit();
  //     invest();
  //     claim();
  //     withdrawLPFromOriginalDeposit();
  //     depositLP(6);
  //     depositLP(7);
  //     withdrawLP(6);
  //     withdrawLP(7);
  //     it("redeem LP after fee accrual", async function () {
  //       const fe17 = BigNumber.from(10).pow(17).mul(40);
  //       await pool.removeReserves(fe17, fe17);
  //       const reservesBefore = await pool
  //         .balancesOf(pool.pool.address)
  //         .then((all) => all.map((x) => new Decimal(x.toString())));
  //       await redeem();
  //       const seniorReceived = await vault.seniorReceived(vaultId);
  //       const seniorExpected = new Decimal(
  //         (await vault.seniorInvested(vaultId)).toString()
  //       )
  //         .times(1.1)
  //         .toFixed(0);
  //       const juniorReceived = await vault.juniorReceived(vaultId);
  //       const reservesAfter = await pool
  //         .balancesOf(pool.pool.address)
  //         .then((all) => all.map((x) => new Decimal(x.toString())));
  //       expect(
  //         reservesBefore[0]
  //           .div(reservesBefore[1])
  //           .gt(reservesAfter[0].div(reservesAfter[1]))
  //       ).eq(true);
  //       expect(seniorReceived.gt(0)).eq(true);
  //       expect(seniorReceived.lt(seniorExpected)).eq(true);
  //       expect(juniorReceived.eq(0)).eq(true);
  //     });
  //     withdraw();
  //   });
  //   describe("sell some junior to cover senior", function () {
  //     before(async function () {
  //       await setup();
  //     });
  //     createVault();
  //     deposit();
  //     invest();
  //     claim();
  //     withdrawLPFromOriginalDeposit();
  //     depositLP(6);
  //     depositLP(7);
  //     withdrawLP(6);
  //     withdrawLP(7);
  //     it("redeem LP after fee accrual", async function () {
  //       const fe17 = BigNumber.from(10).pow(17).mul(8);
  //       await pool.addReserves(fe17, fe17);
  //       const reservesBefore = await pool
  //         .balancesOf(pool.pool.address)
  //         .then((all) => all.map((x) => new Decimal(x.toString())));
  //       await redeem();
  //       const seniorReceived = await vault.seniorReceived(vaultId);
  //       const seniorExpected = new Decimal(
  //         (await vault.seniorInvested(vaultId)).toString()
  //       )
  //         .times(1.1)
  //         .toFixed(0);
  //       const juniorReceived = await vault.juniorReceived(vaultId);
  //       const reservesAfter = await pool
  //         .balancesOf(pool.pool.address)
  //         .then((all) => all.map((x) => new Decimal(x.toString())));
  //       expect(
  //         reservesBefore[0]
  //           .div(reservesBefore[1])
  //           .gt(reservesAfter[0].div(reservesAfter[1]))
  //       ).eq(true);
  //       expect(seniorReceived.eq(seniorExpected)).equal(true);
  //       expect(juniorReceived.gt(0)).eq(true);
  //     });
  //     withdraw();
  //   });
});*/
