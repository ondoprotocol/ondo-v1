import { ethers } from "ethers";

export const redeem = async (
  allPairVault: ethers.Contract,
  user: ethers.Signer,
  vaultId: string
) => {
  await allPairVault.connect(user).redeem(ethers.BigNumber.from(vaultId), 0, 0); // TODO: Generate correct min values
};
