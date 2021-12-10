import { expect } from "chai";
import { ethers } from "hardhat";
import { EdenStrategy__factory } from "../../../typechain";

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
    let edenFactory: EdenStrategy__factory = new EdenStrategy__factory(
      this.signers[0]
    );
    await expect(
      edenFactory.deploy(
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        ethers.constants.AddressZero,
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address
      )
    ).to.be.revertedWith("rewardsManager address cannot be zero");
  });
  it("should not allow zero address for the staking address deploying uniswap strategy", async function () {
    let bondFactory: EdenStrategy__factory = new EdenStrategy__factory(
      this.signers[0]
    );
    await expect(
      bondFactory.deploy(
        this.registryContract.address,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address,
        ethers.constants.AddressZero,
        this.routerContract.address,
        this.routerContract.address,
        this.routerContract.address
      )
    ).to.be.revertedWith("weth cannot be zero");
  });
  it("should not allow zero address for the staking address deploying uniswap strategy", async function () {
    let bondFactory: EdenStrategy__factory = new EdenStrategy__factory(
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
    ).to.be.revertedWith("eden cannot be zero");
  });
  it("should not allow zero address for the staking address deploying uniswap strategy", async function () {
    let bondFactory: EdenStrategy__factory = new EdenStrategy__factory(
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
        this.routerContract.address
      )
    ).to.be.revertedWith("wethedenUniLp cannot be zero");
  });
  it("should not allow zero address for the staking address deploying uniswap strategy", async function () {
    let bondFactory: EdenStrategy__factory = new EdenStrategy__factory(
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
    ).to.be.revertedWith("sushi address cannot be zero");
  });
}
