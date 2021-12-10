import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { invest } from "../utils/invest";

task("invest", "Invest to the vault")
  .addParam("vaultId", "Input the vault id", undefined, types.string)
  .addParam("user", "Input signer index", 0, types.int)
  .setAction(async (args: { vaultId: string; user: number }) => {
    const hre: HardhatRuntimeEnvironment = require("hardhat");
    const ethers = hre.ethers;

    let signers: SignerWithAddress[] = await ethers.getSigners();

    const allPair = await ethers.getContract("AllPairVault");
    const vaultInfo = await allPair.getVaultById(args.vaultId);

    const now: number = (await ethers.provider.getBlock("latest")).timestamp;
    await ethers.provider.send("evm_increaseTime", [
      vaultInfo.investAt.sub(now).toNumber(),
    ]);
    await ethers.provider.send("evm_mine", []);

    await invest(allPair, signers[args.user], args.vaultId);
  });
