import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "ethers";
import { getAddress } from "../utils/helpers";

export type Asset = {
  token: string;
  trancheToken: string;
  trancheCap: ethers.BigNumber;
  userCap: ethers.BigNumber;
  deposited: ethers.BigNumber;
  originalInvested: ethers.BigNumber;
  totalInvested: ethers.BigNumber;
  received: ethers.BigNumber;
  rolloverDeposited: ethers.BigNumber;
};

export type VaultView = {
  id: ethers.BigNumber;
  assets: Asset[];
  strategy: string;
  creator: string;
  strategist: string;
  rollover: string;
  hurdleRate: ethers.BigNumber;
  state: ethers.BigNumber;
  startAt: ethers.BigNumber;
  investAt: ethers.BigNumber;
  redeemAt: ethers.BigNumber;
};

task("vaultInfo", "Query all vaults")
  .addFlag("tokens", "option to show tokens")
  .addFlag("trancheTokens", "option to show tranche tokens")
  .addFlag("strategy", "option to show strategy")
  .addFlag("creator", "option to show creator")
  .addFlag("strategist", "option to show strategist")
  .addFlag("rollover", "option to show rollover")
  .addFlag("json", "option to show result in json format")
  .setAction(
    async (args: {
      tokens: boolean;
      trancheTokens: boolean;
      strategy: boolean;
      creator: boolean;
      strategist: boolean;
      rollover: boolean;
      json: boolean;
    }) => {
      const hre: HardhatRuntimeEnvironment = require("hardhat");
      const ethers = hre.ethers;

      // load addresses
      const address = getAddress(hre);

      // prepare map: tokenAddress => tokenName
      const tokenNameMap: any = {};
      for (const [name, tokenAddress] of Object.entries(address.assets)) {
        tokenNameMap[tokenAddress] = name.toUpperCase();
      }

      // query all vaults
      const allPair = await ethers.getContract("AllPairVault");
      const allVaults = [];
      const countPerSearch = 100;
      for (let i = 0; ; i++) {
        const vaults = <VaultView[]>(
          await allPair.getVaults(
            i * countPerSearch,
            i * (countPerSearch + 1) - 1
          )
        );
        allVaults.push(
          ...vaults.map((vault) => {
            const res: any = {
              id: vault.id.toHexString(),
            };
            if (args.tokens) {
              for (let j = 0; j < vault.assets.length; j++) {
                res["token" + j] =
                  tokenNameMap[vault.assets[j].token.toLowerCase()];
              }
            }
            if (args.trancheTokens) {
              for (let j = 0; j < vault.assets.length; j++) {
                res["trahcneToken" + j] = vault.assets[j].trancheToken;
              }
            }
            if (args.strategy) {
              res.strategy = vault.strategy;
            }
            if (args.creator) {
              res.creator = vault.creator;
            }
            if (args.strategist) {
              res.strategist = vault.strategist;
            }
            if (args.rollover) {
              res.rollover = vault.rollover;
            }
            return res;
          })
        );
        if (vaults.length < countPerSearch) {
          break;
        }
      }

      if (args.json) {
        console.log(allVaults);
      } else {
        console.table(allVaults);
      }
    }
  );
