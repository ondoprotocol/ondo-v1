import { ethers } from "ethers";

export const deposit = async (
  allPairVault: ethers.Contract,
  vaultId: string,
  tranche: number,
  amount: ethers.BigNumberish,
  user: ethers.Signer
) => {
  await allPairVault
    .connect(user)
    .deposit(ethers.BigNumber.from(vaultId), tranche, amount);
};
