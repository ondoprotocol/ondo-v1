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
import { RolloverFixture } from "./utils/rollover";

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

    RolloverFixture.init(signers, vault, roll, strategy);
  });

  function setup() {
    it("create pool", async function () {
      pool = await UniPoolMock.createMock(
        signers[0],
        addresses.uniswap.router,
        ethers.utils.parseUnits("1"),
        ethers.utils.parseUnits("1")
      );
      RolloverFixture.setPool(pool);
    });
  }

  describe("basic round", function () {
    setup();
    RolloverFixture.createRollover();
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
  });

  describe("round with single deposit", function () {
    setup();
    RolloverFixture.createRollover();
    RolloverFixture.singleDeposit(6, 0);
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
  });

  describe("round with claim", function () {
    setup();
    RolloverFixture.createRollover();
    RolloverFixture.singleDeposit(6, 0);
    RolloverFixture.singleDeposit(6, 1);
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
    RolloverFixture.claim(6, 0);
    RolloverFixture.claim(6, 1);
  });

  describe("round with withdraw", function () {
    setup();
    RolloverFixture.createRollover();
    RolloverFixture.singleDeposit(6, 0);
    RolloverFixture.singleDeposit(6, 1);
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
    RolloverFixture.withdraw(6, 0);
    RolloverFixture.withdraw(6, 1);
  });

  describe("round with depositLp", function () {
    setup();
    RolloverFixture.createRollover();
    RolloverFixture.singleDeposit(6, 0);
    RolloverFixture.singleDeposit(6, 1);
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
    RolloverFixture.withdraw(6, 0);
    RolloverFixture.withdraw(6, 1);
    RolloverFixture.depositLp(7);
  });

  describe("round with withdrawLp", function () {
    setup();
    RolloverFixture.createRollover();
    RolloverFixture.singleDeposit(6, 0);
    RolloverFixture.singleDeposit(6, 1);
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
    RolloverFixture.withdraw(6, 0);
    RolloverFixture.withdraw(6, 1);
    RolloverFixture.depositLp(7);
    RolloverFixture.depositLp(8);
    RolloverFixture.withdrawLp(7);
    RolloverFixture.withdrawLp(8);
  });

  describe("deposit after claim", function () {
    setup();
    RolloverFixture.createRollover();
    RolloverFixture.singleDeposit(6, 0);
    RolloverFixture.singleDeposit(6, 1);
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
    RolloverFixture.claim(6, 0);
    RolloverFixture.claim(6, 1);
    RolloverFixture.singleDeposit(6, 0);
    RolloverFixture.singleDeposit(6, 1);
    RolloverFixture.deposit();
    RolloverFixture.addNextVault();
    RolloverFixture.migrate();
    RolloverFixture.claim(6, 0);
    RolloverFixture.claim(6, 1);
  });
});
