import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import {
  AllPairVault,
  AllPairVault__factory,
  PancakeStrategyLP,
  PancakeStrategyLP__factory,
  Registry,
  Registry__factory,
  //RolloverVault,
  //RolloverVault__factory,
  TrancheToken,
  TrancheToken__factory,
  IUniswapV2Router02,
  IWETH,
  IPancakeMasterChef,
  IERC20,
} from "../../typechain";
import { keccak256 } from "ethers/lib/utils";
import { BigNumber } from "ethers";
use(solidity);

const zeroAddress = "0x" + "0".repeat(40);

const wbnb = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const pancakeRouter = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const pancakeMasterChef = "0x73feaa1eE314F8c655E354234017bE2193C9E24E";
const pancakeFactory = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const cakeToken = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
// const cakeBnbPairAddress = '0xA527a61703D82139F8a06Bc30097cC9CAA2df5A6';    // pid=1
// const cakeBnbPairId = 1;
const cakeBnbPairAddress = "0x0ed7e52944161450477ee417de9cd3a859b14fd0"; // pid=251
const cakeBnbPairId = 251;

const e18 = BigNumber.from("10").pow(18);
const e18str = e18.toString();
const { provider } = ethers;

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

type VaultParams = {
  seniorAsset: string;
  juniorAsset: string;
  strategist: string;
  strategy: string;
  hurdleRate: number;
  startTime: number;
  enrollment: number;
  duration: number;
  seniorName: string;
  seniorSym: string;
  juniorName: string;
  juniorSym: string;
  seniorTrancheCap: number;
  juniorTrancheCap: number;
  seniorUserCap: number;
  juniorUserCap: number;
};

const getPoolId = async (chef: IPancakeMasterChef, address: string) => {
  const poolLength: string = (await chef.poolLength()).toString();
  for (let i = 0; i < Number(poolLength); i += 1) {
    const pool = await chef.poolInfo(i);
    console.log(i);
    if (pool.lpToken.toLowerCase() == address.toLowerCase()) {
      console.log("Address: ", address, "pid: ", i);
      break;
    }
  }
  console.log("End. pool length: ", poolLength.toString());
};

const getNewVaultId = async (vault: VaultParams) => {
  const encoded = ethers.utils.defaultAbiCoder.encode(
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
      vault.seniorAsset,
      vault.juniorAsset,
      vault.strategy,
      vault.hurdleRate,
      vault.startTime,
      vault.startTime + vault.enrollment,
      vault.startTime + vault.enrollment + vault.duration,
    ]
  );
  return ethers.BigNumber.from(ethers.utils.keccak256(encoded)).toString();
};

describe("Pancake", () => {
  const srId = 0;
  const jrId = 1;

  const depositSrUser1 = e18.mul(2537);
  const depositJrUser1 = e18.mul(682);
  const depositSrUser2 = e18.mul(1562);
  const depositJrUser2 = e18.mul(9);

  let signers: SignerWithAddress[];
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let registry: Registry;
  let allPairVault: AllPairVault;
  //let rollover: RolloverVault;
  let trancheToken: TrancheToken;
  let PancakeStrategyLP: PancakeStrategyLP;
  let router: IUniswapV2Router02;
  let wBnb: IWETH;
  let cake: IERC20;
  let cakeBscPair: IERC20;
  let chef: IPancakeMasterChef;
  let srTrancheTokenCakeBnb: TrancheToken;
  let jrTrancheTokenCakeBnb: TrancheToken;

  let cakeBnbVaultId: string;

  const increaseTime = async (time: number) => {
    await provider.send("evm_increaseTime", [Math.floor(time)]);
  };

  const balanceUser1 = async () => {
    console.log("----balances user1");
    console.log(
      "cake user1",
      (await cake.balanceOf(user1.address)).toString(),
      (await cake.balanceOf(user1.address)).div(e18).toString()
    );
    console.log(
      "bnb user1",
      (await provider.getBalance(user1.address)).toString(),
      (await provider.getBalance(user1.address)).div(e18).toString()
    );
    console.log(
      "wbnb user1",
      (await wBnb.balanceOf(user1.address)).toString(),
      (await wBnb.balanceOf(user1.address)).div(e18).toString()
    );
  };

  const balanceUser2 = async () => {
    console.log("----balances user2");
    console.log(
      "cake user2",
      (await cake.balanceOf(user2.address)).toString(),
      (await cake.balanceOf(user2.address)).div(e18).toString()
    );
    console.log(
      "bnb user2",
      (await provider.getBalance(user2.address)).toString(),
      (await provider.getBalance(user2.address)).div(e18).toString()
    );
    console.log(
      "wbnb user2",
      (await wBnb.balanceOf(user2.address)).toString(),
      (await wBnb.balanceOf(user2.address)).div(e18).toString()
    );
  };

  before(async function () {
    signers = await ethers.getSigners();
    signer = signers[0];
    user1 = signers[1];
    user2 = signers[2];
    const registryFactory = new Registry__factory(signer);
    const allPairVaultFactory = new AllPairVault__factory(signer);
    //const rolloverFactory = new RolloverVault__factory(signer);
    const trancheTokenFactory = new TrancheToken__factory(signer);
    const PancakeStrategyLPFactory = new PancakeStrategyLP__factory(signer);
    trancheToken = await trancheTokenFactory.deploy();
    registry = await registryFactory.deploy(
      signer.address,
      signer.address,
      wbnb
    );
    allPairVault = await allPairVaultFactory.deploy(
      registry.address,
      trancheToken.address
    );
    PancakeStrategyLP = await PancakeStrategyLPFactory.deploy(
      registry.address,
      pancakeRouter,
      pancakeMasterChef,
      pancakeFactory,
      cakeToken
    );

    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      pancakeRouter,
      signer
    );

    wBnb = await ethers.getContractAt("IWETH", wbnb, signer);

    chef = await ethers.getContractAt(
      "IPancakeMasterChef",
      pancakeMasterChef,
      signer
    );

    cake = await ethers.getContractAt("IERC20", cakeToken, signer);

    cakeBscPair = await ethers.getContractAt(
      "IERC20",
      cakeBnbPairAddress,
      signer
    );

    await registry.grantRole(
      keccak256(Buffer.from("DEPLOYER_ROLE", "utf-8")),
      signer.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("CREATOR_ROLE", "utf-8")),
      signer.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("STRATEGIST_ROLE", "utf-8")),
      signer.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("STRATEGY_ROLE", "utf-8")),
      PancakeStrategyLP.address
    );
    await registry.grantRole(
      keccak256(Buffer.from("VAULT_ROLE", "utf-8")),
      allPairVault.address
    );

    /*rollover = await rolloverFactory.deploy(
      allPairVault.address,
      registry.address,
      trancheToken.address
    );

    await registry.grantRole(
      keccak256(Buffer.from("ROLLOVER_ROLE", "utf-8")),
      rollover.address
    );*/
  });

  describe("Pools", () => {
    it("should be NOT possible to add pool if wrong pool Id", async () => {
      await expect(
        PancakeStrategyLP.addPool(cakeBnbPairAddress, "0", [])
      ).to.be.revertedWith("Pool ID does not match pool");
    });

    it("should be NOT possible to add pool if zero pool address", async () => {
      await expect(
        PancakeStrategyLP.addPool(zeroAddress, "0", [])
      ).to.be.revertedWith("'Cannot be zero address");
    });

    it("should be NOT possible to add pool if pool have cake token and NOT zero length path", async () => {
      await expect(
        PancakeStrategyLP.addPool(cakeBnbPairAddress, cakeBnbPairId, [
          zeroAddress,
        ])
      ).to.be.revertedWith(
        "Pool either must have main token and zero length or no main token in pool"
      );
    });

    //todo should be NOT possible to add pool with not cake token and have wrong path

    it("should be possible to add pool", async () => {
      await PancakeStrategyLP.addPool(cakeBnbPairAddress, cakeBnbPairId, []);
    });

    //todo should be possible to add pool with not cake token and have valid path - "Not a valid path for pool"

    it("should be NOT possible to add pool if pool already registered", async () => {
      await expect(
        PancakeStrategyLP.addPool(cakeBnbPairAddress, cakeBnbPairId, [])
      ).to.be.revertedWith("Pool ID already registered");
    });

    //todo: add "Not a valid path for pool"

    it("should be NOT possible to update unregistered pool", async () => {
      await expect(
        PancakeStrategyLP.updatePool(signer.address, [])
      ).to.be.revertedWith("Pool ID not yet registered");
    });

    it("should be NOT possible to update pool if pool with cake token", async () => {
      await expect(
        PancakeStrategyLP.updatePool(cakeBnbPairAddress, [])
      ).to.be.revertedWith("Should never need to update pool with main token");
    });

    //todo: test for not cake pair

    // it("should be NOT possible to update pool if NOT valid path for pool", async function () {
    //   await expect(PancakeStrategyLP.updatePool(cakeBnbPairAddress, []))
    //     .to.be.revertedWith("Not a valid path for pool");
    // });
  });

  describe("Vaults", async () => {
    it("should be possible to create vault", async () => {
      const now: number = (await provider.getBlock("latest")).timestamp;

      const hurdleRate = 10000;
      const startTime = now + 10;
      const enrollment = 60;
      const duration = 300;
      const seniorName = "PancakeSwap Tranche Token";
      const seniorSym = "CakeTT";
      const juniorName = "Wrapped BNB Tranche Token";
      const juniorSym = "WBNBTT";
      const seniorTrancheCap = 0;
      const juniorTrancheCap = 0;
      const seniorUserCap = 0;
      const juniorUserCap = 0;

      const vault: VaultParams = {
        seniorAsset: cakeToken,
        juniorAsset: wbnb,
        strategist: signer.address,
        strategy: PancakeStrategyLP.address,
        hurdleRate,
        startTime,
        enrollment,
        duration,
        seniorName,
        seniorSym,
        juniorName,
        juniorSym,
        seniorTrancheCap,
        juniorTrancheCap,
        seniorUserCap,
        juniorUserCap,
      };

      cakeBnbVaultId = await getNewVaultId(vault);

      await allPairVault.createVault(vault);

      const vaultView = await allPairVault.getVaultById(cakeBnbVaultId);

      srTrancheTokenCakeBnb = await ethers.getContractAt(
        "TrancheToken",
        vaultView.assets[0].trancheToken,
        signer
      );
      jrTrancheTokenCakeBnb = await ethers.getContractAt(
        "TrancheToken",
        vaultView.assets[1].trancheToken,
        signer
      );

      const srTokenVault = await allPairVault.VaultsByTokens(
        srTrancheTokenCakeBnb.address
      );
      const jrTokenVault = await allPairVault.VaultsByTokens(
        jrTrancheTokenCakeBnb.address
      );

      expect(srTokenVault.toString()).equal(cakeBnbVaultId);
      expect(jrTokenVault.toString()).equal(cakeBnbVaultId);

      expect((await srTrancheTokenCakeBnb.vaultId()).toString()).equal(
        cakeBnbVaultId
      );
      expect((await jrTrancheTokenCakeBnb.vaultId()).toString()).equal(
        cakeBnbVaultId
      );
      expect(await srTrancheTokenCakeBnb.vault()).equal(allPairVault.address);
      expect(await jrTrancheTokenCakeBnb.vault()).equal(allPairVault.address);
      expect(await srTrancheTokenCakeBnb.symbol()).equal(seniorSym);
      expect(await jrTrancheTokenCakeBnb.symbol()).equal(juniorSym);
      expect(await srTrancheTokenCakeBnb.name()).equal(seniorName);
      expect(await jrTrancheTokenCakeBnb.name()).equal(juniorName);

      expect(vaultView.strategy).equal(PancakeStrategyLP.address);
      expect(vaultView.creator).equal(signer.address);
      expect(vaultView.strategist).equal(signer.address);
      //expect(vaultView.rollover).equal(zeroAddress);
      expect(vaultView.hurdleRate.toString()).equal(hurdleRate.toString());
      expect(vaultView.state).equal(0);
      expect(vaultView.startAt.toString()).equal(startTime.toString());
      expect(vaultView.investAt.toString()).equal(
        BigNumber.from(startTime + enrollment).toString()
      );
      expect(vaultView.redeemAt.toString()).equal(
        BigNumber.from(startTime + enrollment + duration).toString()
      );
    });

    //todo: add negative tests
  });

  describe("Deposit", () => {
    before(async () => {
      await user1.sendTransaction({
        to: wbnb,
        value: e18.mul(9000),
      });

      await user2.sendTransaction({
        to: wbnb,
        value: e18.mul(9000),
      });

      await increaseTime(1);

      await router.swapExactETHForTokens(
        0,
        [wbnb, cakeToken],
        user1.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(4000),
        }
      );

      await router.swapExactETHForTokens(
        0,
        [wbnb, cakeToken],
        user2.address,
        (await ethers.provider.getBlock("latest")).timestamp + 2000,
        {
          value: e18.mul(4000),
        }
      );
    });

    it("should be possible to deposit senior and junior tokens", async () => {
      await cake.connect(user1).approve(allPairVault.address, depositSrUser1);
      await wBnb.connect(user1).approve(allPairVault.address, depositJrUser1);
      await cake.connect(user2).approve(allPairVault.address, depositSrUser2);
      await wBnb.connect(user2).approve(allPairVault.address, depositJrUser2);

      const balanceSrTokenUser1 = await cake.balanceOf(user1.address);
      const balanceSrTokenUser2 = await cake.balanceOf(user2.address);
      const balanceJrTokenUser1 = await wBnb.balanceOf(user1.address);
      const balanceJrTokenUser2 = await wBnb.balanceOf(user2.address);

      await allPairVault
        .connect(user1)
        .deposit(cakeBnbVaultId, srId, depositSrUser1);
      await allPairVault
        .connect(user1)
        .deposit(cakeBnbVaultId, jrId, depositJrUser1);
      await allPairVault
        .connect(user2)
        .deposit(cakeBnbVaultId, srId, depositSrUser2);
      await allPairVault
        .connect(user2)
        .deposit(cakeBnbVaultId, jrId, depositJrUser2);

      expect(
        balanceSrTokenUser1.sub(await cake.balanceOf(user1.address)).toString()
      ).equal(depositSrUser1.toString());
      expect(
        balanceJrTokenUser1.sub(await wBnb.balanceOf(user1.address)).toString()
      ).equal(depositJrUser1.toString());
      expect(
        balanceSrTokenUser2.sub(await cake.balanceOf(user2.address)).toString()
      ).equal(depositSrUser2.toString());
      expect(
        balanceJrTokenUser2.sub(await wBnb.balanceOf(user2.address)).toString()
      ).equal(depositJrUser2.toString());

      const vaultView = await allPairVault.getVaultById(cakeBnbVaultId);

      expect(vaultView.assets[srId].deposited.toString()).equal(
        depositSrUser1.add(depositSrUser2).toString()
      );
      expect(vaultView.assets[jrId].deposited.toString()).equal(
        depositJrUser1.add(depositJrUser2).toString()
      );

      expect(
        (
          await allPairVault.connect(user1).vaultInvestor(cakeBnbVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal(depositSrUser1.toString());
      expect(
        (
          await allPairVault.connect(user1).vaultInvestor(cakeBnbVaultId, jrId)
        ).withdrawableExcess.toString()
      ).equal(depositJrUser1.toString());
      expect(
        (
          await allPairVault.connect(user2).vaultInvestor(cakeBnbVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal(depositSrUser2.toString());
      expect(
        (
          await allPairVault.connect(user2).vaultInvestor(cakeBnbVaultId, jrId)
        ).withdrawableExcess.toString()
      ).equal(depositJrUser2.toString());
    });
    // todo: add negative tests
  });

  describe("Invest", () => {
    before(async () => {
      await registry.connect(signer).enableTokens();
      await increaseTime(enrollment);
    });

    it("should be possible to invest assets", async () => {
      let vaultView = await allPairVault.getVaultById(cakeBnbVaultId);

      expect(vaultView.state).equal(1);

      expect(vaultView.assets[srId].originalInvested.toString()).equal("0");
      expect(vaultView.assets[jrId].originalInvested.toString()).equal("0");
      expect(vaultView.assets[srId].totalInvested.toString()).equal("0");
      expect(vaultView.assets[jrId].totalInvested.toString()).equal("0");

      await allPairVault.invest(cakeBnbVaultId, 0, 0);

      vaultView = await allPairVault.getVaultById(cakeBnbVaultId);

      expect(vaultView.state).equal(2);

      expect(vaultView.assets[srId].originalInvested.toString()).equal(
        depositSrUser1.add(depositSrUser2)
      );
      // expect(vaultView.assets[jrId].originalInvested.toString()).equal(depositedJr);
      expect(vaultView.assets[srId].totalInvested.toString()).equal(
        depositSrUser1.add(depositSrUser2)
      );
      // expect(vaultView.assets[jrId].totalInvested.toString()).equal(depositedJr);

      expect(
        (
          await allPairVault.connect(user1).vaultInvestor(cakeBnbVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal("0");
      // expect((await allPairVault.connect(user1).vaultInvestor(cakeBnbVaultId, jrId)).withdrawableExcess.toString())
      //   .equal('0');
      expect(
        (
          await allPairVault.connect(user2).vaultInvestor(cakeBnbVaultId, srId)
        ).withdrawableExcess.toString()
      ).equal("0");
      // expect((await allPairVault.connect(user2).vaultInvestor(cakeBnbVaultId, jrId)).withdrawableExcess.toString())
      //   .equal('0');
    });
  });

  describe("Claim", () => {
    it("should be possible to deposit senior and junior tokens", async () => {
      await allPairVault.connect(user1).claim(cakeBnbVaultId, 0);
      await allPairVault.connect(user2).claim(cakeBnbVaultId, 0);

      expect(
        (await srTrancheTokenCakeBnb.balanceOf(user1.address)).toString(),
        depositSrUser1.toString()
      );
      expect(
        (await srTrancheTokenCakeBnb.balanceOf(user2.address)).toString(),
        depositSrUser2.toString()
      );
    });
  });

  describe("DepositLp", () => {
    it("should be possible to deposit LP tokens", async () => {
      await cake.connect(user1).approve(pancakeRouter, e18.mul(1000));
      await wBnb.connect(user1).approve(pancakeRouter, e18.mul(100));

      const now: number = (await provider.getBlock("latest")).timestamp;

      await router
        .connect(user1)
        .addLiquidity(
          cakeToken,
          wbnb,
          e18.mul(1000),
          e18.mul(100),
          0,
          0,
          user1.address,
          now + 2
        );

      const lpBalance = await cakeBscPair.balanceOf(user1.address);

      await cakeBscPair.connect(user1).approve(allPairVault.address, lpBalance);

      await allPairVault.connect(user1).depositLp(cakeBnbVaultId, lpBalance);
    });
  });

  describe("withdrawLP", () => {
    it("should be possible to withdraw LP tokens", async () => {
      await allPairVault
        .connect(user1)
        .withdrawLp(cakeBnbVaultId, e18.mul(100));
    });
  });

  describe("Harvest", () => {
    it("should be possible to harvest", async () => {
      await expect(
        PancakeStrategyLP.connect(user1).harvest(cakeBscPair.address, 0)
      ).to.be.revertedWith("Unauthorized");
      await PancakeStrategyLP.connect(signer).harvest(cakeBscPair.address, 0);
    });
  });

  describe("Redeem", () => {
    before(async () => {
      await increaseTime(duration);
    });

    it("should be possible to redeem", async () => {
      await expect(
        allPairVault.connect(user1).redeem(cakeBnbVaultId, 0, 0)
      ).to.be.revertedWith("Invalid caller");
      await allPairVault.connect(signer).redeem(cakeBnbVaultId, 0, 0);
    });
  });

  describe("Withdraw", () => {
    it("should be possible to withdraw", async () => {
      const balanceSrTokenUser1 = await cake.balanceOf(user1.address);
      const balanceJrTokenUser1 = await wBnb.balanceOf(user1.address);

      await allPairVault.connect(user1).withdraw(cakeBnbVaultId, srId);
      await allPairVault.connect(user1).withdraw(cakeBnbVaultId, jrId);

      const withdrawSrTokenUser1 = (await cake.balanceOf(user1.address)).sub(
        balanceSrTokenUser1
      );
      const withdrawJrTokenUser1 = (await wBnb.balanceOf(user1.address)).sub(
        balanceJrTokenUser1
      );

      console.log(
        "Withdraw Sr token:",
        withdrawSrTokenUser1.toString(),
        "Profit Sr token:",
        withdrawSrTokenUser1.sub(depositSrUser1).toString()
      );
      console.log(
        "Withdraw Jr token:",
        withdrawJrTokenUser1.toString(),
        "Profit Jr token:",
        withdrawJrTokenUser1.sub(depositJrUser1).toString()
      );
    });
  });
});
