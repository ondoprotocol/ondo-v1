import { expect } from "chai";
import { createVault } from "../../scripts/utils/helpers";
import { deployments, ethers } from "hardhat";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";

let harvestAt: number;
let investAt: number;
let createAt: number;
let vaultId: BigNumber;
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);

//this file should eventually test all the core features of the vault
export function shouldBehaveLikeVaultDuringRollovers(): void {
  it("should allow Rollover admin to set Rollover details in the Rollover vault", async function () {});
  it("should not allow Rollover admin to set Rollover details if the vault is not a Rollover vault", async function () {});
  it("should not allow Rollover admin to set Rollover details if the vault is not a Rollover vault", async function () {});
  it("should allow rollover contract only to deposit assets in the rollover vault", async function () {});
  it("should allow rollover contract to claim assets from the rollover vaults only", async function () {});
  it("should allow rollover contract to redeem assets from the rollover vaults only", async function () {});
}
