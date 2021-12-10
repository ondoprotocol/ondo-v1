import { AllPairVault } from "../../typechain";
import { BigNumber } from "ethers";

export async function hurdleRate(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).hurdleRate;
}

export async function startAt(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).startAt;
}

export async function investAt(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).investAt;
}

export async function redeemAt(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).redeemAt;
}

export async function seniorInvested(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[0].totalInvested;
}

export async function juniorInvested(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[1].totalInvested;
}

export async function seniorDeposited(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[0].deposited;
}

export async function juniorDeposited(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[1].deposited;
}

export async function seniorReceived(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[0].received;
}

export async function juniorReceived(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[1].received;
}

export async function seniorTotalInvested(
  contract: AllPairVault,
  id: BigNumber
) {
  return (await contract.getVaultById(id)).assets[0].totalInvested;
}

export async function juniorTotalInvested(
  contract: AllPairVault,
  id: BigNumber
) {
  return (await contract.getVaultById(id)).assets[1].totalInvested;
}

export async function seniorAsset(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[0].token;
}

export async function juniorAsset(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).assets[1].token;
}

export async function strategy(contract: AllPairVault, id: BigNumber) {
  return (await contract.getVaultById(id)).strategy;
}
