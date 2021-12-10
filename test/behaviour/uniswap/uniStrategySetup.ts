import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { UniswapStrategy__factory } from "../../../typechain";
import { mainnet } from "../../../scripts/utils/addresses";

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
  it("should not allow zero address for the registry while deploying uniswap strategy", async function () {
    let univ2Factory: UniswapStrategy__factory = new UniswapStrategy__factory(
      this.signers[0]
    );
    await expect(
      univ2Factory.deploy(
        this.registryContract.address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        [],
        []
      )
    ).to.be.revertedWith("Invalid target");
  });
}
