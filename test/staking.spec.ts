import { keccak256 } from "@ethersproject/keccak256";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers } from "hardhat";
import {
  ERC20Mock,
  ERC20Mock__factory,
  Ondo,
  StakingPools,
  StakingPools__factory,
} from "../typechain";
const { provider } = ethers;
use(solidity);

describe("StakingPools", async function () {
  let signers: SignerWithAddress[];
  let accounts: string[];
  let stakingPools: StakingPools;
  let ondo: Ondo;
  let stakingPoolsFactory: StakingPools__factory;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let lp: ERC20Mock;
  let lp2: ERC20Mock;

  before(async () => {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    deployer = signers[0];
    alice = signers[1];
    bob = signers[2];
    carol = signers[3];
  });

  beforeEach(async () => {
    await deployments.fixture(["Ondo"]);

    // retrieve Ondo contract and enable transfer
    ondo = await ethers.getContract("Ondo");
    await ondo.enableTransfer();

    stakingPoolsFactory = new StakingPools__factory(deployer);

    lp = await new ERC20Mock__factory(deployer).deploy();

    await lp.mint(deployer.address, "10000000000");

    await lp.transfer(alice.address, "1000");

    await lp.transfer(bob.address, "1000");

    await lp.transfer(carol.address, "1000");

    lp2 = await new ERC20Mock__factory(deployer).deploy();
    await lp2.mint(deployer.address, "10000000000");

    await lp2.transfer(alice.address, "1000");

    await lp2.transfer(bob.address, "1000");

    await lp2.transfer(carol.address, "1000");
  });

  it("should set correct state variables", async () => {
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "1000",
      latestBlockNumber,
      latestBlockNumber + 1000
    );

    const ondoAddress = await stakingPools.ondo();
    const ondoPerBlock = await stakingPools.ondoPerBlock();
    const startBlock = await stakingPools.startBlock();
    const endBlock = await stakingPools.bonusEndBlock();

    expect(ondoAddress).to.equal(ondo.address);
    expect(ondoPerBlock).to.equal("1000");
    expect(startBlock).to.equal(latestBlockNumber);
    expect(endBlock).to.equal(latestBlockNumber + 1000);
  });

  it("should allow emergency withdraw", async () => {
    // 100 per block farming rate starting at block 100 with bonus until block 1000
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "100",
      latestBlockNumber + 100,
      latestBlockNumber + 1000
    );

    await stakingPools.add("100", lp.address, true);

    await lp.connect(bob).approve(stakingPools.address, "1000");

    await stakingPools.connect(bob).deposit(0, "100");

    expect(await lp.balanceOf(bob.address)).to.equal("900");

    await stakingPools.connect(bob).emergencyWithdraw(0);

    expect(await lp.balanceOf(bob.address)).to.equal("1000");
  });

  it("should give out ondos only after farming time", async function () {
    // 100 per block farming rate starting at block 100 with bonus until block 1000
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "100",
      latestBlockNumber + 100,
      latestBlockNumber + 1000
    );

    await ondo.transfer(stakingPools.address, "100000");

    await stakingPools.add("100", lp.address, true);

    await lp.connect(bob).approve(stakingPools.address, "1000");
    await stakingPools.connect(bob).deposit(0, "100");
    await advanceBlockTo(latestBlockNumber + 89);

    await stakingPools.connect(bob).deposit(0, "0"); // block 90
    expect(await ondo.balanceOf(bob.address)).to.equal("0");
    await advanceBlockTo(latestBlockNumber + 94);

    await stakingPools.connect(bob).deposit(0, "0"); // block 95
    expect(await ondo.balanceOf(bob.address)).to.equal("0");
    await advanceBlockTo(latestBlockNumber + 99);

    await stakingPools.connect(bob).deposit(0, "0"); // block 100
    expect(await ondo.balanceOf(bob.address)).to.equal("0");
    await advanceBlockTo(latestBlockNumber + 100);

    await stakingPools.connect(bob).deposit(0, "0"); // block 101
    expect(await ondo.balanceOf(bob.address)).to.equal("1000");

    await advanceBlockTo(latestBlockNumber + 104);
    await stakingPools.connect(bob).deposit(0, "0"); // block 105

    expect(await ondo.balanceOf(bob.address)).to.equal("5000");
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("0");
    expect(await stakingPools.poolLength()).to.equal("1");
  });

  it("should not distribute ONDOs if no one deposit", async () => {
    // 100 per block farming rate starting at block 200 with bonus until block 1000
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "100",
      latestBlockNumber + 200,
      latestBlockNumber + 1000
    );

    await ondo.transfer(stakingPools.address, "100000");

    await stakingPools.add("100", lp.address, true);
    await lp.connect(bob).approve(stakingPools.address, "1000");

    await advanceBlockTo(latestBlockNumber + 199);
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("0");

    await advanceBlockTo(latestBlockNumber + 204);
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("0");

    await advanceBlockTo(latestBlockNumber + 209);
    await stakingPools.connect(bob).deposit(0, "10"); // block 210
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("0");
    expect(await ondo.balanceOf(bob.address)).to.equal("0");
    expect(await lp.balanceOf(bob.address)).to.equal("990");

    await advanceBlockTo(latestBlockNumber + 219);
    // expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("11000");
    await stakingPools.connect(bob).withdraw(0, "10"); // block 220
    // expect(await ondo.totalSupply()).to.equal("11000");

    expect(await ondo.balanceOf(bob.address)).to.equal("10000");
    expect(await lp.balanceOf(bob.address)).to.equal("1000");
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("0");
    expect(await stakingPools.poolLength()).to.equal("1");
  });

  it("should distribute ondos properly for each staker", async function () {
    // 100 per block farming rate starting at block 300 with bonus until block 1000
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "100",
      latestBlockNumber + 300,
      latestBlockNumber + 1000
    );

    await ondo.transfer(stakingPools.address, "100000");

    await stakingPools.add("100", lp.address, true);
    await lp.connect(alice).approve(stakingPools.address, "1000", {
      from: alice.address,
    } as any);

    await lp.connect(bob).approve(stakingPools.address, "1000", {
      from: bob.address,
    } as any);

    await lp.connect(carol).approve(stakingPools.address, "1000", {
      from: carol.address,
    } as any);

    // Alice deposits 10 LPs at block 310
    await advanceBlockTo(latestBlockNumber + 309);
    await stakingPools
      .connect(alice)
      .deposit(0, "10", (({ from: alice.address } as any) as any) as any);
    // Bob deposits 20 LPs at block 314
    await advanceBlockTo(latestBlockNumber + 313);
    await stakingPools
      .connect(bob)
      .deposit(0, "20", ({ from: bob.address } as any) as any);
    // Carol deposits 30 LPs at block 318
    await advanceBlockTo(latestBlockNumber + 317);
    await stakingPools
      .connect(carol)
      .deposit(0, "30", { from: carol.address } as any);
    // Alice deposits 10 more LPs at block 320. At this point:
    //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
    //   StakingPools should have the remaining: 10000 - 5666 = 4334
    await advanceBlockTo(latestBlockNumber + 319);
    await stakingPools
      .connect(alice)
      .deposit(0, "10", (({ from: alice.address } as any) as any) as any);
    // expect(await ondo.totalSupply()).to.equal("11000");
    expect(await ondo.balanceOf(alice.address)).to.equal("5666");
    expect(await ondo.balanceOf(bob.address)).to.equal("0");
    expect(await ondo.balanceOf(carol.address)).to.equal("0");
    expect(await ondo.balanceOf(stakingPools.address)).to.equal("94334");
    // expect(await ondo.balanceOf(dev.address)).to.equal("1000");
    // Bob withdraws 5 LPs at block 330. At this point:
    //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
    await advanceBlockTo(latestBlockNumber + 329);
    await stakingPools
      .connect(bob)
      .withdraw(0, "5", ({ from: bob.address } as any) as any);
    // expect(await ondo.totalSupply()).to.equal("22000");
    expect(await ondo.balanceOf(alice.address)).to.equal("5666");
    expect(await ondo.balanceOf(bob.address)).to.equal("6190");
    expect(await ondo.balanceOf(carol.address)).to.equal("0");
    expect(await ondo.balanceOf(stakingPools.address)).to.equal("88144"); // 100000 - 5666 - 6190
    // expect(await ondo.balanceOf(dev.address)).to.equal("2000");
    // Alice withdraws 20 LPs at block 340.
    // Bob withdraws 15 LPs at block 350.
    // Carol withdraws 30 LPs at block 360.
    await advanceBlockTo(latestBlockNumber + 339);
    await stakingPools
      .connect(alice)
      .withdraw(0, "20", (({ from: alice.address } as any) as any) as any);
    await advanceBlockTo(latestBlockNumber + 349);
    await stakingPools
      .connect(bob)
      .withdraw(0, "15", ({ from: bob.address } as any) as any);
    await advanceBlockTo(latestBlockNumber + 359);
    await stakingPools
      .connect(carol)
      .withdraw(0, "30", { from: carol.address } as any);
    // expect(await ondo.totalSupply()).to.equal("55000");
    // expect(await ondo.balanceOf(dev.address)).to.equal("5000");
    // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
    expect(await ondo.balanceOf(alice.address)).to.equal("11600");
    // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
    expect(await ondo.balanceOf(bob.address)).to.equal("11831");
    // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
    expect(await ondo.balanceOf(carol.address)).to.equal("26568");
    // All of them should have 1000 LPs back.
    expect(await lp.balanceOf(alice.address)).to.equal("1000");
    expect(await lp.balanceOf(bob.address)).to.equal("1000");
    expect(await lp.balanceOf(carol.address)).to.equal("1000");
    expect(await stakingPools.poolLength()).to.equal("1");
  });

  it("should give proper ONDOs allocation to each pool", async function () {
    // 100 per block farming rate starting at block 400 with bonus until block 1000
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "100",
      latestBlockNumber + 400,
      latestBlockNumber + 1000
    );

    await ondo.transfer(stakingPools.address, "100000");
    await lp.connect(alice).approve(stakingPools.address, "1000", ({
      from: alice.address,
    } as any) as any);
    await lp2
      .connect(bob)
      .approve(stakingPools.address, "1000", { from: bob.address } as any);
    // Add first LP to the pool with allocation 1
    await stakingPools.add("10", lp.address, true);
    // Alice deposits 10 LPs at block 410
    await advanceBlockTo(latestBlockNumber + 409);
    await stakingPools
      .connect(alice)
      .deposit(0, "10", ({ from: alice.address } as any) as any);
    // Add LP2 to the pool with allocation 2 at block 420
    await advanceBlockTo(latestBlockNumber + 419);
    await stakingPools.add("20", lp2.address, true);
    // Alice should have 10*1000 pending reward
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("10000");
    // Bob deposits 10 LP2s at block 425
    await advanceBlockTo(latestBlockNumber + 424);
    await stakingPools
      .connect(bob)
      .deposit(1, "5", { from: bob.address } as any);
    // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("11666");
    await advanceBlockTo(latestBlockNumber + 430);
    // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("13333");
    expect(await stakingPools.pendingOndo(1, bob.address)).to.equal("3333");
    expect(await stakingPools.poolLength()).to.equal("2");
  });

  it("should stop giving bonus ONDOs after the bonus period ends", async function () {
    // 100 per block farming rate starting at block 500 with bonus until block 600
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "100",
      latestBlockNumber + 500,
      latestBlockNumber + 600
    );

    await ondo.transfer(stakingPools.address, "100000");
    await lp
      .connect(alice)
      .approve(stakingPools.address, "1000", { from: alice.address } as any);
    await stakingPools.add("1", lp.address, true);
    // Alice deposits 10 LPs at block 590
    await advanceBlockTo(latestBlockNumber + 589);
    await stakingPools
      .connect(alice)
      .deposit(0, "10", { from: alice.address } as any);
    // At block 605, she should have 1000*10 + 100*5 = 10500 pending.
    await advanceBlockTo(latestBlockNumber + 605);
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("10500");
    // At block 606, Alice withdraws all pending rewards and should get 10600.
    await stakingPools
      .connect(alice)
      .deposit(0, "0", { from: alice.address } as any);
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("0");
    expect(await ondo.balanceOf(alice.address)).to.equal("10600");
    expect(await stakingPools.poolLength()).to.equal("1");
  });

  it("should track minimumOndoRequiredBalance properly", async function () {
    // 100 per block farming rate starting at block 400 with bonus until block 1000
    const latestBlockNumber = (await provider.getBlock("latest")).number;
    stakingPools = await stakingPoolsFactory.deploy(
      deployer.address,
      ondo.address,
      "100",
      latestBlockNumber + 400,
      latestBlockNumber + 1000
    );

    await ondo.transfer(stakingPools.address, "100000");
    await lp.connect(alice).approve(stakingPools.address, "1000", ({
      from: alice.address,
    } as any) as any);
    await lp2
      .connect(bob)
      .approve(stakingPools.address, "1000", { from: bob.address } as any);
    // Add first LP to the pool with allocation 1
    await stakingPools.add("10", lp.address, true);
    // Alice deposits 10 LPs at block 410
    await advanceBlockTo(latestBlockNumber + 409);
    await stakingPools
      .connect(alice)
      .deposit(0, "10", ({ from: alice.address } as any) as any);
    // Add LP2 to the pool with allocation 2 at block 420
    await advanceBlockTo(latestBlockNumber + 419);
    await stakingPools.add("20", lp2.address, true);
    // Alice should have 10*1000 pending reward
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("10000");
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("10000");
    // Bob deposits 10 LP2s at block 425
    await advanceBlockTo(latestBlockNumber + 424);
    await stakingPools
      .connect(bob)
      .deposit(1, "5", { from: bob.address } as any);
    // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("11666");
    await stakingPools.updatePool(0);
    // Alice should have 10000 + 6*1/3*1000 = 12000 pending reward
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("12000");
    await advanceBlockTo(latestBlockNumber + 430);
    // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
    expect(await stakingPools.pendingOndo(0, alice.address)).to.equal("13333");
    expect(await stakingPools.pendingOndo(1, bob.address)).to.equal("3333");
    expect(await stakingPools.poolLength()).to.equal("2");

    await stakingPools.updatePool(0);
    await stakingPools.updatePool(1);
    // bob 7*2/3*1000 = 4666 + alice 13666 (333 more)
    expect(await stakingPools.minimumRequiredOndoBalance()).to.equal("18332");
  });
});

const advanceBlock = async () => ethers.provider.send("evm_mine", []);

const advanceBlockTo = async (blockNumber: number) => {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock();
  }
};
