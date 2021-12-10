import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { getAddress } from "../utils/helpers";
import { convertAmountString, exitIf } from "./utils";
import { ETH, swap } from "../utils/swap";

task("swap", "Swap tokens")
  .addParam("from", "Input the source asset", "ETH", types.string)
  .addParam("to", "Input the destination asset", undefined, types.string)
  .addParam("router", "Input the router source", "Uniswap", types.string)
  .addParam("amount", "Input the amount to swap", undefined, types.string)
  .addOptionalParam("path", "Input the swap path", undefined, types.string)
  .addOptionalParam("only", "Input signer index", undefined, types.int)
  .setAction(
    async (args: {
      from: string;
      to: string;
      router: string;
      amount: string;
      path?: string;
      only?: number;
    }) => {
      const hre: HardhatRuntimeEnvironment = require("hardhat");
      const ethers = hre.ethers;

      // load addresses
      const address = getAddress(hre);

      // make params lowercase
      args.from = args.from.toLowerCase();
      args.to = args.to.toLowerCase();
      args.router = args.router.toLowerCase();

      // convert amount string
      args.amount = convertAmountString(args.amount);

      // check asset
      exitIf(
        args.from != "eth" && !Object.keys(address.assets).includes(args.from),
        "Invalid source asset: " + args.from
      );
      exitIf(
        args.to != "eth" && !Object.keys(address.assets).includes(args.to),
        "Invalid destination asset: " + args.to
      );
      exitIf(args.from == args.to, "Same source and destination asset");

      // calculate swapPath
      let swapPath = [];
      if (args.path) {
        for (const asset of args.path.toLowerCase().split(",")) {
          exitIf(
            !Object.keys(address.assets).includes(asset),
            "Invalid path asset: " + asset
          );

          swapPath.push((address.assets as any)[asset]);
        }
      }

      // calculate router
      let router: string;
      if (args.router == "uniswap") {
        router = address.uniswap.router;
      } else if (args.router == "sushiswap") {
        router = address.sushi.router;
      } else {
        exitIf(true, "Invalid router");
      }

      let signers: SignerWithAddress[] = await ethers.getSigners();

      for (let i = 0; i < signers.length; i++) {
        if (args.only !== undefined && args.only != i) {
          continue;
        }

        await swap({
          hre,
          user: signers[i],
          router: router!,
          from: args.from == "eth" ? ETH : (address.assets as any)[args.from],
          to: args.to == "eth" ? ETH : (address.assets as any)[args.to],
          path: swapPath,
          amount: args.amount,
        });
      }
    }
  );
