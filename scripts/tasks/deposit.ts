import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { getAddress } from "../utils/helpers";
import { convertAmountString, exitIf } from "./utils";
import { deposit } from "../utils/deposit";

task("deposit", "Deposit to the vault")
  .addParam("vaultId", "Input the vault id", undefined, types.string)
  .addParam("asset", "Input the tranche asset", undefined, types.string)
  .addParam("trancheIndex", "Input the tranche index", -1, types.int)
  .addParam("amount", "Input the tranche asset", undefined, types.string)
  .addParam("user", "Input signer index", 0, types.int)
  .setAction(
    async (args: {
      vaultId: string;
      asset: string;
      trancheIndex: number;
      amount: string;
      user: number;
    }) => {
      const hre: HardhatRuntimeEnvironment = require("hardhat");
      const ethers = hre.ethers;

      // calculate tranche asset address
      const address = getAddress(hre);
      exitIf(
        !Object.keys(address.assets).includes(args.asset.toLowerCase()),
        "Invalid asset: " + args.asset
      );
      const trancheAddress = (address.assets as any)[args.asset.toLowerCase()];

      // convert amount string
      args.amount = convertAmountString(args.amount);

      // get vault information
      const allPair = await ethers.getContract("AllPairVault");
      const vaultInfo = await allPair.getVaultById(args.vaultId);

      // calculate tranche id (senior or junior)
      let tranche = vaultInfo.assets.findIndex(
        (asset: any) => asset[0].toLowerCase() == trancheAddress.toLowerCase()
      );
      exitIf(tranche == -1, "invalid tranche asset: " + trancheAddress);

      // check tranche index matches to tranche asset
      if (args.trancheIndex != -1) {
        exitIf(
          vaultInfo.assets[args.trancheIndex][0].toLowerCase() !=
            trancheAddress.toLowerCase(),
          "invalid tranche index: " + args.trancheIndex
        );
        tranche = args.trancheIndex;
      }

      // increase the time to `startAt`
      const now: number = (await ethers.provider.getBlock("latest")).timestamp;
      if (vaultInfo.state != 1 && vaultInfo.startAt.gt(now)) {
        await ethers.provider.send("evm_increaseTime", [
          vaultInfo.startAt.sub(now).toNumber(),
        ]);
      }
      await ethers.provider.send("evm_mine", []);

      // approve asset
      const signers: SignerWithAddress[] = await ethers.getSigners();
      const user = signers[args.user];
      const fromToken = await ethers.getContractAt("IERC20", trancheAddress);
      await fromToken.connect(user).approve(allPair.address, args.amount);

      // deposit asset
      await deposit(allPair, args.vaultId, tranche, args.amount, user);
    }
  );
