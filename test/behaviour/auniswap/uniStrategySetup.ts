import { expect } from "chai";
import { ethers } from "hardhat";
import { BondStrategy__factory } from "../../../typechain";

//this file should eventually test all the core features of the vault
export function shouldValidateUniStrategyDeployment() {
  before("Setup", async function () {
    this.vaultParams = {
      ...this.vaultParams,
      strategy: this.strategy.address,
      strategist: this.accounts[0],
      seniorAsset: this.seniorAsset,
      juniorAsset: this.juniorAsset,
      seniorName: await this.seniorTokenContract.name(),
      seniorSym: await this.seniorTokenContract.symbol(),
      juniorName: await this.juniorTokenContract.name(),
      juniorSym: await this.juniorTokenContract.symbol(),
    };
  });
  it("should not allow zero address for the staking address deploying uniswap strategy", async function () {
    let bondFactory: BondStrategy__factory = new BondStrategy__factory(
      this.signers[0]
    );
    await expect(
      bondFactory.deploy(
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWith("staking address cannot be zero");
  });
  it("should not allow zero address for the yieldfarm address deploying uniswap strategy", async function () {
    let bondFactory: BondStrategy__factory = new BondStrategy__factory(
      this.signers[0]
    );
    await expect(
      bondFactory.deploy(
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWith("yieldfarm cannot be zero");
  });
  it("should not allow zero address for the usdc address deploying uniswap strategy", async function () {
    let bondFactory: BondStrategy__factory = new BondStrategy__factory(
      this.signers[0]
    );
    await expect(
      bondFactory.deploy(
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        ethers.constants.AddressZero,
        this.routerContract.address,
        this.routerContract.address
      )
    ).to.be.revertedWith("usdc cannot be zero");
  });
  it("should not allow zero address for the bond address deploying uniswap strategy", async function () {
    let bondFactory: BondStrategy__factory = new BondStrategy__factory(
      this.signers[0]
    );
    await expect(
      bondFactory.deploy(
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWith("bond cannot be zero");
  });
  it("should not allow zero address for the usdcBondUniLp address deploying uniswap strategy", async function () {
    let bondFactory: BondStrategy__factory = new BondStrategy__factory(
      this.signers[0]
    );
    await expect(
      bondFactory.deploy(
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWith("usdcBondUniLp cannot be zero");
  });
}
