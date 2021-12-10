import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { BigNumber, BigNumberish, BytesLike, Signer } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  AllPairVault,
  ERC20,
  ERC20Mock,
  IERC20,
  BasePairLPStrategy,
  Registry,
  TrancheToken,
  TrancheToken__factory,
  UniswapStrategy,
} from "../../typechain";
import _ from "lodash";
import { UniPoolMock, calcExactMatchSr } from "./uni";
import Decimal from "decimal.js";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder } from "@ethersproject/abi";

import { pack } from "@ethersproject/solidity";
import { arrayify } from "@ethersproject/bytes";
import { keccak256 } from "@ethersproject/keccak256";
import { getCreate2Address } from "@ethersproject/address";
import { solidityKeccak256 } from "ethers/lib/utils";
import * as get from "./getters";

const CLONE_CODE_HASH =
  "0xd2e01e16c4e1b1769fa1698820efb75a7791ef93e3f224efdab72df0d443ed93";

const get_tranche_tokens = (
  implementation: string,
  vaultAddress: string,
  baseSalt: BigNumber
): [string, string] => {
  const srAddr = eip1167Predict(
    implementation,
    solidityKeccak256(["bytes"], [pack(["uint256", "uint256"], [0, baseSalt])]),
    vaultAddress
  );
  const jrAddr = eip1167Predict(
    implementation,
    solidityKeccak256(["bytes"], [pack(["uint256", "uint256"], [1, baseSalt])]),
    vaultAddress
  );
  return [srAddr, jrAddr];
};

const prefix = arrayify("0x3d602d80600a3d3981f3363d3d373d3d3d363d73");
const suffix = arrayify("0x5af43d82803e903d91602b57fd5bf3");

const eip1167CodeHash = (implementation: string) => {
  const out = new Uint8Array(55);
  out.set(prefix);
  out.set(arrayify(implementation), 20);
  out.set(suffix, 40);
  return keccak256(out);
};

const eip1167Predict = (
  implementation: string,
  salt: BytesLike,
  deployer: string
) => {
  return getCreate2Address(deployer, salt, eip1167CodeHash(implementation));
};

const { provider } = ethers;

const coder = new AbiCoder();

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

interface Tranched<T> {
  0: T;
  1: T;
}

interface SignerDeposits {
  [address: string]: {
    deposit: BigNumber;
    prefixSum: BigNumber;
    invested: BigNumber;
    excess: BigNumber;
    redeemed: BigNumber;
    result: BigNumber;
  };
}

interface BalancesMap {
  [signerAddr: string]: BigNumber;
}

const calcVaultInfo = (
  startTime: number,
  enrollment: number,
  duration: number,
  srAsset: IERC20,
  jrAsset: IERC20,
  strategy: BasePairLPStrategy,
  hurdleRate: number
) => {
  const investAt = startTime + enrollment;
  const redeemAt = investAt + duration;
  const encoded = coder.encode(
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
      srAsset.address,
      jrAsset.address,
      strategy.address,
      hurdleRate,
      startTime,
      investAt,
      redeemAt,
    ]
  );
  const vaultId = BigNumber.from(keccak256(encoded));
  const [srERC20, jrERC20] = get_tranche_tokens(
    trancheTokenImpl,
    allPair.address,
    vaultId
  );
  return {
    vaultId,
    investAt,
    redeemAt,
    srERC20: TrancheToken__factory.connect(srERC20, provider),
    jrERC20: TrancheToken__factory.connect(jrERC20, provider),
  };
};

let allPair: AllPairVault;
let trancheTokenImpl: string;
let unilike: UnilikeVault;
let signers: SignerWithAddress[];
let midTermWithdrawSigner: SignerWithAddress;
let accounts: string[];

const initAll = (_allPair: AllPairVault, _trancheTokenImpl: string) => {
  allPair = _allPair;
  trancheTokenImpl = _trancheTokenImpl;
};

const setUnilike = (_unilike: UnilikeVault) => {
  unilike = _unilike;
};

const setSigners = (
  _signers: SignerWithAddress[],
  _midTermWithdrawSigner: SignerWithAddress
) => {
  signers = _signers;
  accounts = _signers.map((x) => x.address);
  midTermWithdrawSigner = _midTermWithdrawSigner;
};

abstract class BaseVault {
  public deposits: Tranched<SignerDeposits>;
  public totalDeposited: Tranched<BigNumber>;
  public totalInvested: Tranched<BigNumber>;
  public totalRedeemed: Tranched<BigNumber>;
  public investAt: number;
  public redeemAt: number;
  public vaultId: BigNumber;
  public srERC20: TrancheToken;
  public jrERC20: TrancheToken;
  protected constructor(
    public srDepositors: SignerWithAddress[],
    public jrDepositors: SignerWithAddress[],
    public strategy: BasePairLPStrategy,

    public srAsset: IERC20,
    public jrAsset: IERC20,
    public startTime: number,
    public enrollment: number,
    public duration: number,
    public hurdle: number
  ) {
    this.deposits = { 0: {}, 1: {} };
    this.totalDeposited = { 0: BigNumber.from(0), 1: BigNumber.from(0) };
    this.totalInvested = { 0: BigNumber.from(0), 1: BigNumber.from(0) };
    this.totalRedeemed = { 0: BigNumber.from(0), 1: BigNumber.from(0) };
    const vaultInfo = calcVaultInfo(
      startTime,
      enrollment,
      duration,
      srAsset,
      jrAsset,
      strategy,
      hurdle
    );
    this.investAt = vaultInfo.investAt;
    this.redeemAt = vaultInfo.redeemAt;
    this.vaultId = vaultInfo.vaultId;
    this.srERC20 = vaultInfo.srERC20;
    this.jrERC20 = vaultInfo.jrERC20;
  }
}

const e18 = new Decimal(1e18);

const threeE18 = e18.mul(3);

class UnilikeVault extends BaseVault {
  constructor(
    public pool: UniPoolMock,
    srDepositors: SignerWithAddress[],
    jrDepositors: SignerWithAddress[],
    strategy: BasePairLPStrategy,
    srAsset: ERC20Mock,
    jrAsset: ERC20Mock,
    startTime: number,
    enrollment: number,
    duration: number,
    hurdle: number
  ) {
    super(
      srDepositors,
      jrDepositors,
      strategy,
      srAsset,
      jrAsset,
      startTime,
      enrollment,
      duration,
      hurdle
    );
    accounts = signers.map((x) => x.address);
  }
  async userDeposit(
    signer: SignerWithAddress,
    tranche: 0 | 1,
    amount: BigNumberish
  ) {
    const token: ERC20Mock = (<any>this.pool)["token" + tranche];
    await token.mint(signer.address, amount);
    await token.connect(signer).approve(allPair.address, amount);
    this.totalDeposited[tranche] = this.totalDeposited[tranche].add(amount);
    this.deposits[tranche][signer.address] = {
      prefixSum: this.totalDeposited[tranche],
      deposit: BigNumber.from(amount),
      invested: BigNumber.from(0),
      excess: BigNumber.from(0),
      redeemed: BigNumber.from(0),
      result: BigNumber.from(0),
    };

    if (this.totalDeposited[0].gte(this.totalDeposited[1])) {
      this.totalInvested[0] = this.totalDeposited[1];
      this.totalInvested[1] = this.totalDeposited[1];
    } else {
      this.totalInvested[0] = this.totalDeposited[0];
      this.totalInvested[1] = this.totalDeposited[0];
    }
    await allPair.connect(signer).deposit(this.vaultId, tranche, amount);
  }
  async redeem() {
    await allPair.redeem(this.vaultId, 0, 0);
    this.totalRedeemed[0] = await get.seniorReceived(allPair, this.vaultId);
    this.totalRedeemed[1] = await get.juniorReceived(allPair, this.vaultId);
  }

  computeExpectedUsersInvestedByTranche(tranche: 0 | 1) {
    const total = this.totalInvested[tranche];
    this.deposits[tranche] = _.transform(
      this.deposits[tranche],
      (acc: SignerDeposits, val, key) => {
        // n.b. lazy, only works with one deposit
        acc[key] = val;
        const diff = total.sub(val.prefixSum.sub(val.deposit));
        if (diff.gte(val.deposit)) {
          acc[key].invested = val.deposit;
        } else if (diff.gt(0)) {
          acc[key].invested = diff;
          acc[key].excess = val.deposit.sub(diff);
        } else {
          acc[key].excess = val.deposit;
        }
      },
      {}
    );
  }
  computeExpectedUsersInvested() {
    this.computeExpectedUsersInvestedByTranche(0);
    this.computeExpectedUsersInvestedByTranche(1);
  }

  computeUsersRedeemedByTranche(tranche: 0 | 1) {
    const _totalInvested = new Decimal(this.totalInvested[tranche].toString());
    const _totalRedeemed = new Decimal(this.totalRedeemed[tranche].toString());
    this.deposits[tranche] = _.transform(
      this.deposits[tranche],
      (acc: SignerDeposits, val, key) => {
        acc[key] = val;
        acc[key].redeemed = BigNumber.from(
          _totalRedeemed
            .mul(val.invested.toString())
            .div(_totalInvested)
            .toFixed(0)
        );
        acc[key].result = val.excess.add(acc[key].redeemed);
      },
      {}
    );
  }
  computeUsersRedeemed() {
    this.computeUsersRedeemedByTranche(0);
    this.computeUsersRedeemedByTranche(1);
  }
}

class UnilikeFixture {
  static init(
    _signers: SignerWithAddress[],
    _midTermWithdrawSigner: SignerWithAddress,
    _allPair: AllPairVault,
    _trancheTokenImpl: string
  ) {
    setSigners(_signers, _midTermWithdrawSigner);
    initAll(_allPair, _trancheTokenImpl);
  }
  static async createVault(
    pool: UniPoolMock,
    strategy: BasePairLPStrategy,
    hurdle: number,
    enrollment: number,
    duration: number,
    delay: boolean = false
  ) {
    const seniorAsset = pool.token0.address;
    const juniorAsset = pool.token1.address;
    await (strategy as any).setPathJuniorToSenior([juniorAsset, seniorAsset]);
    await (strategy as any).setPathSeniorToJunior([seniorAsset, juniorAsset]);
    const startTime = (await provider.getBlock("latest")).timestamp + 3;
    const bigzero = BigNumber.from(0);
    const vaultParams = {
      strategy: strategy.address,
      strategist: accounts[0],
      seniorAsset,
      juniorAsset,
      hurdleRate: hurdle,
      startTime: startTime,
      enrollment: enrollment,
      duration: duration,
      seniorName: "Senior",
      seniorSym: "SR",
      juniorName: "Junior",
      juniorSym: "JR",
      seniorTrancheCap: bigzero,
      seniorUserCap: bigzero,
      juniorTrancheCap: bigzero,
      juniorUserCap: bigzero,
    };
    await allPair.createVault(vaultParams);
    if (delay) {
      await provider.send("evm_mine", [startTime]);
    }

    const srDepositors = signers.slice(0, 3);
    const jrDepositors = signers.slice(3, 6);
    const unilike = new UnilikeVault(
      pool,
      srDepositors,
      jrDepositors,
      strategy,
      pool.token0,
      pool.token1,
      startTime,
      enrollment,
      duration,
      hurdle
    );

    const srTokenVault = await allPair.VaultsByTokens(unilike.srERC20.address);
    const jrTokenVault = await allPair.VaultsByTokens(unilike.jrERC20.address);

    expect(srTokenVault).equal(unilike.vaultId);
    expect(jrTokenVault).equal(unilike.vaultId);
    expect(await unilike.srERC20.vaultId()).equal(unilike.vaultId);
    expect(await unilike.jrERC20.vaultId()).equal(unilike.vaultId);
    expect(await unilike.srERC20.vault()).equal(allPair.address);
    expect(await unilike.jrERC20.vault()).equal(allPair.address);
    expect(await unilike.srERC20.symbol()).equal("SR");
    expect(await unilike.jrERC20.symbol()).equal("JR");

    expect(await get.hurdleRate(allPair, unilike.vaultId)).eq(hurdle);
    expect(await get.investAt(allPair, unilike.vaultId)).eq(unilike.investAt);
    expect(await get.redeemAt(allPair, unilike.vaultId)).eq(unilike.redeemAt);
    expect(await get.strategy(allPair, unilike.vaultId)).eq(strategy.address);
    expect(await get.seniorAsset(allPair, unilike.vaultId)).eq(
      pool.token0.address
    );
    expect(await get.juniorAsset(allPair, unilike.vaultId)).eq(
      pool.token1.address
    );
    await expect(
      strategy.invest(unilike.vaultId, 0, 0, 0, 0, 0, 0)
    ).revertedWith("Unauthorized: Only Vault contract");
    await expect(strategy.redeem(unilike.vaultId, 0, 0, 0)).revertedWith(
      "Unauthorized: Only Vault contract"
    );
    setUnilike(unilike);
  }

  static get unilike() {
    return unilike;
  }

  static invest() {
    it("invest assets", async function () {
      const nonStrategist = allPair.connect(signers[3]);
      await expect(nonStrategist.invest(unilike.vaultId, 0, 0)).revertedWith(
        "Invalid caller"
      );
      await allPair.invest(unilike.vaultId, 0, 0);
      await expect(allPair.invest(unilike.vaultId, 0, 0)).revertedWith(
        //        "Cannot transition to Live from current state"
        "Invalid operation"
      );
      await expect(allPair.redeem(unilike.vaultId, 0, 0)).revertedWith(
        "Not time yet"
      );
      const seniorInvested = await get.seniorInvested(allPair, unilike.vaultId);
      const juniorInvested = await get.juniorInvested(allPair, unilike.vaultId);
      expect(seniorInvested.toString()).equal(unilike.totalInvested[0]);
      expect(juniorInvested.toString()).equal(unilike.totalInvested[1]);
    });
  }
  static getters() {
    it("gets Vault by tranche token addresses", async function () {
      expect(
        (await allPair.getVaultByToken(unilike.srERC20.address)).hurdleRate
      ).equal(unilike.hurdle);
      expect(
        (await allPair.getVaultByToken(unilike.jrERC20.address)).hurdleRate
      ).equal(unilike.hurdle);
    });
    it("gets all Vaults", async function () {
      expect((await allPair.getVaults(0, 1))[0].hurdleRate).equal(
        unilike.hurdle
      );
    });
  }

  static async addFeesSeniorSurplus() {
    const seniorExpected = await allPair.seniorExpected(unilike.vaultId).toD();
    const seniorDesired = seniorExpected.mul(1.5);
    const vaultData = await unilike.strategy.vaults(unilike.vaultId);
    const [lp] = await unilike.strategy.lpFromShares(
      unilike.vaultId,
      vaultData.shares
    );
    const totalSupply = await unilike.pool.pool.totalSupply().toD();
    const totalReservesNeeded = seniorDesired
      .mul(totalSupply)
      .div(lp.toString());
    const [rs] = await unilike.pool.pool.getReserves();
    const rneed = totalReservesNeeded.sub(rs.toString()).toFixed();
    await unilike.pool.addReserves(rneed, 0);
  }

  static async addFeesBigSrDeficit() {
    const seniorExpected = await allPair.seniorExpected(unilike.vaultId).toD();
    const vaultData = await unilike.strategy.vaults(unilike.vaultId);
    const [lp] = await unilike.strategy.lpFromShares(
      unilike.vaultId,
      vaultData.shares
    );
    const totalSupply = await unilike.pool.pool.totalSupply().toD();
    const totalReservesNeeded = calcExactMatchSr(
      seniorExpected,
      lp.toD(),
      totalSupply
    );
    const [rs] = await unilike.pool.pool.getReserves();
    const rneed = totalReservesNeeded.sub(rs.toString()).mul(0.99);
    if (rneed.lt(0)) {
      await unilike.pool.removeReserves(rneed.abs().toFixed(0), 0);
    } else if (rneed.gt(0)) {
      await unilike.pool.addReserves(rneed.toFixed(0), 0);
    }
  }

  static async addFeesSmallSeniorDeficit() {
    const seniorExpected = await allPair.seniorExpected(unilike.vaultId).toD();
    const vaultData = await unilike.strategy.vaults(unilike.vaultId);
    const [lp] = await unilike.strategy.lpFromShares(
      unilike.vaultId,
      vaultData.shares
    );
    const totalSupply = await unilike.pool.pool.totalSupply().toD();
    const totalReservesNeededNotExact = seniorExpected
      .mul(totalSupply)
      .div(lp.toString());

    const totalReservesNeededIfExact = calcExactMatchSr(
      seniorExpected,
      lp.toD(),
      totalSupply
    );
    const totalReservesNeeded = totalReservesNeededIfExact
      .plus(totalReservesNeededNotExact)
      .div(2);
    const [rs] = await unilike.pool.pool.getReserves();
    const rneed = totalReservesNeeded.sub(rs.toString()).mul(0.99);
    if (rneed.lt(0)) {
      await unilike.pool.removeReserves(rneed.abs().toFixed(0), 0);
    } else if (rneed.gt(0)) {
      await unilike.pool.addReserves(rneed.toFixed(0), 0);
    }
  }

  static redeemSellSeniorExcess() {
    it("redeem LP after fee accrual", async function () {
      await UnilikeFixture.addFeesSeniorSurplus();
      const reservesBefore = await unilike.pool
        .balancesOf(unilike.pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      const nonStrategist = allPair.connect(signers[3]);
      await expect(nonStrategist.redeem(unilike.vaultId, 0, 0)).revertedWith(
        "Invalid caller"
      );
      await UnilikeFixture.redeem();
      await expect(allPair.redeem(unilike.vaultId, 0, 0)).revertedWith(
        //        "Cannot transition to Withdraw from current state"
        "Invalid operation"
      );
      const seniorReceived = await get.seniorReceived(allPair, unilike.vaultId);
      const seniorExpected = new Decimal(
        (await get.seniorInvested(allPair, unilike.vaultId)).toString()
      )
        .times(1.1)
        .toFixed(0);
      const juniorReceived = await get.juniorReceived(allPair, unilike.vaultId);
      const reservesAfter = await unilike.pool
        .balancesOf(unilike.pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      expect(
        reservesBefore[0]
          .div(reservesBefore[1])
          .lt(reservesAfter[0].div(reservesAfter[1]))
      ).eq(true);
      expect(await allPair.seniorExpected(unilike.vaultId)).eq(seniorExpected);
      expect(seniorReceived.toString()).equal(seniorExpected);
      expect(juniorReceived.gt(0)).eq(true);
    });
  }

  static redeemSellAllJr() {
    it("redeem LP after fee accrual", async function () {
      await UnilikeFixture.addFeesBigSrDeficit();
      const reservesBefore = await unilike.pool
        .balancesOf(unilike.pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      await UnilikeFixture.redeem();
      const seniorReceived = await get.seniorReceived(allPair, unilike.vaultId);
      const seniorExpected = new Decimal(
        (await get.seniorInvested(allPair, unilike.vaultId)).toString()
      )
        .times(1.1)
        .toFixed(0);
      const juniorReceived = await get.juniorReceived(allPair, unilike.vaultId);
      const reservesAfter = await unilike.pool
        .balancesOf(unilike.pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      expect(
        reservesBefore[0]
          .div(reservesBefore[1])
          .gt(reservesAfter[0].div(reservesAfter[1]))
      ).eq(true);
      expect(seniorReceived.gt(0)).eq(true);
      expect(seniorReceived.lt(seniorExpected)).eq(true);
      expect(juniorReceived.eq(0)).eq(true);
    });
  }

  static redeemSellSomeJr() {
    it("redeem LP after fee accrual", async function () {
      await UnilikeFixture.addFeesSmallSeniorDeficit();
      const reservesBefore = await unilike.pool
        .balancesOf(unilike.pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      await UnilikeFixture.redeem();
      const seniorReceived = await get.seniorReceived(allPair, unilike.vaultId);
      const seniorExpected = new Decimal(
        (await get.seniorInvested(allPair, unilike.vaultId)).toString()
      )
        .times(1.1)
        .toFixed(0);
      const juniorReceived = await get.juniorReceived(allPair, unilike.vaultId);
      const reservesAfter = await unilike.pool
        .balancesOf(unilike.pool.pool.address)
        .then((all) => all.map((x) => new Decimal(x.toString())));
      expect(
        reservesBefore[0]
          .div(reservesBefore[1])
          .gt(reservesAfter[0].div(reservesAfter[1]))
      ).eq(true);
      expect(seniorReceived.eq(seniorExpected)).equal(true);
      expect(juniorReceived.gt(0)).eq(true);
    });
  }

  static async redeem() {
    await unilike.redeem();
    unilike.computeUsersRedeemed();
    const seniorInvested = await get.seniorInvested(allPair, unilike.vaultId);
    const juniorInvested = await get.juniorInvested(allPair, unilike.vaultId);
    expect(seniorInvested.toString()).equal(unilike.totalInvested[0]);
    expect(juniorInvested.toString()).equal(unilike.totalInvested[1]);
  }
  static deposit() {
    it("deposit senior asset", async function () {
      const amountIn = threeE18.toFixed();
      const greaterAmount = BigNumber.from(e18.times(4.5).toFixed());
      await unilike.userDeposit(unilike.srDepositors[0], 0, amountIn);
      await unilike.userDeposit(unilike.srDepositors[1], 0, amountIn);
      await unilike.userDeposit(unilike.srDepositors[2], 0, greaterAmount);
    });
    it("deposit junior asset", async function () {
      const amountIn = threeE18.toFixed();
      const amountToMint = BigNumber.from(e18.times(15).toFixed());
      await unilike.userDeposit(unilike.jrDepositors[0], 1, amountIn);
      await unilike.userDeposit(unilike.jrDepositors[1], 1, amountToMint);
      await unilike.userDeposit(unilike.jrDepositors[2], 1, amountToMint);
    });
    it("deposits as expected", async function () {
      unilike.computeExpectedUsersInvested();
      expect(await get.seniorDeposited(allPair, unilike.vaultId)).eq(
        unilike.totalDeposited[0]
      );
      expect(await get.juniorDeposited(allPair, unilike.vaultId)).eq(
        unilike.totalDeposited[1]
      );
      expect(await unilike.pool.token0.balanceOf(unilike.strategy.address)).eq(
        unilike.totalDeposited[0]
      );
      expect(await unilike.pool.token1.balanceOf(unilike.strategy.address)).eq(
        unilike.totalDeposited[1]
      );
    });
    it("cannot invest too early", async function () {
      await expect(allPair.invest(unilike.vaultId, 0, 0)).revertedWith(
        "Not time yet"
      );
      await provider.send("evm_increaseTime", [unilike.enrollment + 1]);
    });
  }
  static claim() {
    it("claim tranche tokens and excess", async function () {
      await Promise.all(
        unilike.srDepositors.map((s) =>
          allPair.connect(s).claim(unilike.vaultId, 0)
        )
      );

      const srBal = await getBalances(
        unilike.pool.token0,
        unilike.srDepositors
      );
      const srTrBal = await getBalances(unilike.srERC20, unilike.srDepositors);
      await Promise.all(
        unilike.jrDepositors.map((s) =>
          allPair.connect(s).claim(unilike.vaultId, 1)
        )
      );
      const jrBal = await getBalances(
        unilike.pool.token1,
        unilike.jrDepositors
      );
      const jrTrBal = await getBalances(unilike.jrERC20, unilike.jrDepositors);

      for (const [address, amount] of _.toPairs(srBal)) {
        expect(amount).eq(unilike.deposits[0][address].excess);
      }

      for (const [address, amount] of _.toPairs(jrBal)) {
        expect(amount).eq(unilike.deposits[1][address].excess);
      }

      for (const [address, amount] of _.toPairs(srTrBal)) {
        expect(amount).eq(unilike.deposits[0][address].invested);
      }

      for (const [address, amount] of _.toPairs(jrTrBal)) {
        expect(amount).eq(unilike.deposits[1][address].invested);
      }
    });
  }
  static withdraw() {
    it("withdraw received amounts", async function () {
      const firstSenior = unilike.srDepositors[0];
      const fsb = await unilike.srERC20.balanceOf(firstSenior.address);
      let _srDepositors = unilike.srDepositors;
      if (fsb.gt(0)) {
        // this hits the case of obtaining tokens without having deposited/claimed
        _srDepositors = unilike.srDepositors.slice(1);
        const specialSigners = [firstSenior, signers[9]];
        await unilike.srERC20
          .connect(firstSenior)
          .transfer(signers[9].address, fsb.div(2));
        await Promise.all(
          specialSigners.map((s) =>
            allPair.connect(s).withdraw(unilike.vaultId, 0)
          )
        );
        const bal = await getBalances(unilike.pool.token0, specialSigners);
        const trBal = await getBalances(unilike.srERC20, specialSigners);
        for (const amount of _.values(bal)) {
          expect(
            amount
              .sub(unilike.deposits[0][firstSenior.address].result.div(2))
              .abs()
              .lt(100)
          ).eq(true);
        }
        for (const amount of _.values(trBal)) {
          expect(amount).eq(0);
        }
      }
      await Promise.all(
        _srDepositors.map((s) =>
          allPair.connect(s).withdraw(unilike.vaultId, 0)
        )
      );
      await Promise.all(
        unilike.jrDepositors.map((s) =>
          allPair.connect(s).withdraw(unilike.vaultId, 1)
        )
      );
      const srBal = await getBalances(unilike.pool.token0, _srDepositors);
      const jrBal = await getBalances(
        unilike.pool.token1,
        unilike.jrDepositors
      );
      const srTrBal = await getBalances(unilike.srERC20, unilike.srDepositors);
      const jrTrBal = await getBalances(unilike.jrERC20, unilike.jrDepositors);
      for (const [address, amount] of _.toPairs(srBal)) {
        expect(
          amount.sub(unilike.deposits[0][address].result).abs().lt(100)
        ).eq(true);
      }
      for (const [address, amount] of _.toPairs(jrBal)) {
        expect(
          amount.sub(unilike.deposits[1][address].result).abs().lt(100)
        ).eq(true);
      }
      for (const amount of _.values(srTrBal)) {
        expect(amount).eq(0);
      }
      for (const amount of _.values(jrTrBal)) {
        expect(amount).eq(0);
      }
    });
  }
  static depositLP(signerIndex: number) {
    it(`deposit LP tokens mid-duration with signer ${signerIndex}`, async function () {
      const signer = signers[signerIndex];
      const sharesBefore = await unilike.strategy
        .vaults(unilike.vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const [lpBefore] = await unilike.strategy.lpFromShares(
        unilike.vaultId,
        sharesBefore.toFixed(0)
      );
      const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
        unilike.srERC20.balanceOf(signer.address),
        unilike.jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));
      const vaultData = await allPair.getVaultById(unilike.vaultId);
      const seniorTotalBefore = new Decimal(
        vaultData.assets[0].totalInvested.toString()
      );
      const juniorTotalBefore = new Decimal(
        vaultData.assets[1].totalInvested.toString()
      );

      const amountIn = e18.toFixed();
      const lp = await unilike.pool
        .mintAndAdd(amountIn, amountIn, signer.address)
        .then((lp) => new Decimal(lp.toString()));
      const [shares] = await unilike.strategy.sharesFromLp(
        unilike.vaultId,
        lp.toFixed(0)
      );
      await unilike.pool.pool
        .connect(signer)
        .approve(allPair.address, lp.toFixed());
      await allPair.connect(signer).depositLp(unilike.vaultId, lp.toFixed(0));
      const sharesAfter = await unilike.strategy
        .vaults(unilike.vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const [lpAfter] = await unilike.strategy.lpFromShares(
        unilike.vaultId,
        sharesAfter.toFixed(0)
      );
      const _shares = new Decimal(shares.toString());
      const seniorExpected = _shares
        .mul(seniorTotalBefore.toString())
        .div(sharesBefore.toString());

      const juniorExpected = _shares
        .mul(juniorTotalBefore.toString())
        .div(sharesBefore.toString());

      const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
        unilike.srERC20.balanceOf(signer.address),
        unilike.jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));
      unilike.totalInvested[0] = unilike.totalInvested[0].add(
        seniorBalanceAfter.sub(seniorBalanceBefore).toFixed(0)
      );
      unilike.totalInvested[1] = unilike.totalInvested[1].add(
        juniorBalanceAfter.sub(juniorBalanceBefore).toFixed(0)
      );
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
      await provider.send("evm_increaseTime", [unilike.duration / 2]);
    });
  }
  static withdrawLPFromOriginalDeposit() {
    it(`withdraw LP mid-duration from original deposits`, async function () {
      const srSigner = unilike.srDepositors.shift()!;
      const jrSigner = unilike.jrDepositors.shift()!;
      const [seniorBalance, juniorBalance] = await Promise.all([
        unilike.srERC20.balanceOf(srSigner.address),
        unilike.jrERC20.balanceOf(jrSigner.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));
      await unilike.srERC20
        .connect(srSigner)
        .transfer(midTermWithdrawSigner.address, seniorBalance.toFixed());
      await unilike.jrERC20
        .connect(jrSigner)
        .transfer(midTermWithdrawSigner.address, juniorBalance.toFixed());
      const poolInfo = await unilike.strategy.vaults(unilike.vaultId);
      const sharesToWithdraw = seniorBalance
        .mul(poolInfo.shares.toString())
        .div(
          await get
            .seniorInvested(allPair, unilike.vaultId)
            .then((x) => x.toString())
        );
      const [lpToWithdraw] = await unilike.strategy.lpFromShares(
        unilike.vaultId,
        sharesToWithdraw.toFixed(0)
      );
      await allPair
        .connect(midTermWithdrawSigner)
        .withdrawLp(unilike.vaultId, lpToWithdraw);
      unilike.totalInvested[0] = unilike.totalInvested[0].sub(
        seniorBalance.toFixed(0)
      );
      unilike.totalInvested[1] = unilike.totalInvested[1].sub(
        juniorBalance.toFixed(0)
      );
      expect(
        await unilike.pool.pool.balanceOf(midTermWithdrawSigner.address)
      ).eq(lpToWithdraw);
      expect(
        await Promise.all([
          unilike.srERC20.balanceOf(midTermWithdrawSigner.address),
          unilike.jrERC20.balanceOf(midTermWithdrawSigner.address),
        ]).then((all) => all.every((x) => x.eq(0)))
      ).eq(true);
    });
  }
  static withdrawLP(signerIndex: number) {
    it(`withdraw LP mid-duration with signer ${signerIndex}`, async function () {
      const signer = signers[signerIndex];
      const sharesBefore = await unilike.strategy
        .vaults(unilike.vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const [lpBefore] = await unilike.strategy.lpFromShares(
        unilike.vaultId,
        sharesBefore.toFixed(0)
      );
      const [seniorBalanceBefore, juniorBalanceBefore] = await Promise.all([
        unilike.srERC20.balanceOf(signer.address),
        unilike.jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));
      const vaultData = await allPair.getVaultById(unilike.vaultId);

      const seniorTotalBefore = new Decimal(
        vaultData.assets[0].totalInvested.toString()
      );
      const juniorTotalBefore = new Decimal(
        vaultData.assets[1].totalInvested.toString()
      );

      const stratVaultData = await unilike.strategy.vaults(unilike.vaultId);

      const sharesToWithdraw = seniorBalanceBefore
        .mul(stratVaultData.shares.toString())
        .div(seniorTotalBefore);

      const [lpToWithdraw] = await unilike.strategy.lpFromShares(
        unilike.vaultId,
        sharesToWithdraw.toFixed(0)
      );

      await allPair
        .connect(signer)
        .withdrawLp(unilike.vaultId, sharesToWithdraw.toFixed(0));

      const sharesAfter = await unilike.strategy
        .vaults(unilike.vaultId)
        .then((x) => new Decimal(x.shares.toString()));
      const [lpAfter] = await unilike.strategy.lpFromShares(
        unilike.vaultId,
        sharesAfter.toFixed(0)
      );
      const [seniorBalanceAfter, juniorBalanceAfter] = await Promise.all([
        unilike.srERC20.balanceOf(signer.address),
        unilike.jrERC20.balanceOf(signer.address),
      ]).then((all) => all.map((x) => new Decimal(x.toString())));

      const seniorToBurn = sharesToWithdraw
        .div(sharesBefore)
        .mul(seniorTotalBefore);
      const juniorToBurn = sharesToWithdraw
        .div(sharesBefore)
        .mul(juniorTotalBefore);
      unilike.totalInvested[0] = unilike.totalInvested[0].sub(
        seniorBalanceBefore.sub(seniorBalanceAfter).toFixed(0)
      );
      unilike.totalInvested[1] = unilike.totalInvested[1].sub(
        juniorBalanceBefore.sub(juniorBalanceAfter).toFixed(0)
      );

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
      await provider.send("evm_increaseTime", [unilike.duration / 2 + 1]);
    });
  }
}

export { get_tranche_tokens, UnilikeVault, UnilikeFixture };
