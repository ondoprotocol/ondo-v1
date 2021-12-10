import { ethers } from "ethers";

export const invest = async (
  allPairVault: ethers.Contract,
  user: ethers.Signer,
  vaultId: string
) => {
  await allPairVault.connect(user).invest(ethers.BigNumber.from(vaultId), 0, 0); // TODO: Generate correct min values
};
