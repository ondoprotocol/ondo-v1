import { use } from "chai";
import { solidity } from "ethereum-waffle";
import { deployments, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import {
  AllPairVault,
  Registry,
  RolloverVault,
  UniswapStrategy,
} from "../typechain";
import { UniPoolMock } from "./utils/uni";
import { addresses } from "./utils/addresses";
import { RolloverFixture as RolloverFork } from "./utils/rollover-forkednw";

// use(solidity);

describe("RolloverVault", async function () {
  let registry: Registry;
  let vault: AllPairVault;
  let strategy: UniswapStrategy;
  let pool: UniPoolMock;
  let roll: RolloverVault;
  let signers: SignerWithAddress[];
  let accounts: string[];

  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((s) => s.address);
    await deployments.fixture(["UniswapStrategy", "RolloverVault"]);
    vault = await ethers.getContract("AllPairVault");
    strategy = await ethers.getContract("UniswapStrategy");
    registry = await ethers.getContract("Registry");
    roll = await ethers.getContract("RolloverVault");

    await registry.enableTokens();

    RolloverFork.init(signers, vault, roll, strategy);
  });

  function setup() {
    it("create pool", async function () {
      pool = await UniPoolMock.createMock(
        signers[0],
        addresses.uniswap.router,
        ethers.utils.parseUnits("1"),
        ethers.utils.parseUnits("1")
      );
      RolloverFork.setPool();
    });
  }

  describe("basic round", function () {
    setup();
    RolloverFork.createRollover();
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
  });

  describe("round with single deposit", function () {
    setup();
    RolloverFork.createRollover();
    RolloverFork.singleDeposit(6, 0);
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
  });

  describe("round with claim", function () {
    setup();
    RolloverFork.createRollover();
    RolloverFork.singleDeposit(6, 0);
    RolloverFork.singleDeposit(6, 1);
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
    RolloverFork.claim(6, 0);
    RolloverFork.claim(6, 1);
  });

  describe("round with withdraw", function () {
    setup();
    RolloverFork.createRollover();
    RolloverFork.singleDeposit(6, 0);
    RolloverFork.singleDeposit(6, 1);
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
    RolloverFork.withdraw(0, 0);
    RolloverFork.withdraw(6, 1);
  });

  describe("round with depositLp", function () {
    setup();
    RolloverFork.createRollover();
    RolloverFork.singleDeposit(6, 0);
    RolloverFork.singleDeposit(6, 1);
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
    RolloverFork.withdraw(6, 0);
    RolloverFork.withdraw(6, 1);
    RolloverFork.singleAllocate(7, 0);
    RolloverFork.singleAllocate(7, 1);
    RolloverFork.depositLp(7);
  });

  describe("round with withdrawLp", function () {
    setup();
    RolloverFork.createRollover();
    RolloverFork.singleDeposit(6, 0);
    RolloverFork.singleDeposit(6, 1);
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
    RolloverFork.withdraw(6, 0);
    RolloverFork.withdraw(6, 1);
    RolloverFork.singleAllocate(7, 0);
    RolloverFork.singleAllocate(7, 1);
    RolloverFork.depositLp(7);
    RolloverFork.singleAllocate(8, 0);
    RolloverFork.singleAllocate(8, 1);
    RolloverFork.depositLp(8);
    RolloverFork.withdrawLp(7);
    RolloverFork.withdrawLp(8);
  });

  describe("deposit after claim", function () {
    setup();
    RolloverFork.createRollover();
    RolloverFork.singleDeposit(6, 0);
    RolloverFork.singleDeposit(6, 1);
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
    RolloverFork.claim(6, 0);
    RolloverFork.claim(6, 1);
    RolloverFork.singleDeposit(6, 0);
    RolloverFork.singleDeposit(6, 1);
    RolloverFork.deposit();
    RolloverFork.addNextVault();
    RolloverFork.migrate();
    RolloverFork.claim(6, 0);
    RolloverFork.claim(6, 1);
  });
});
