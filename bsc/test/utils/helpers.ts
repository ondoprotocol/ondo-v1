require("dotenv").config();
import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as allAddresses from "./addresses";
import { AllPairVault } from "../../../typechain";

export const getVaultId = (
  values: [string, string, string, number, number, number, number]
): ethers.BigNumber => {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "address",
      "address",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
    ],
    values
  );
  return ethers.BigNumber.from(ethers.utils.keccak256(encoded));
};

export const getAddresses = () => {
  if (process.env.BLOCKCHAIN == "bsc") {
    return allAddresses.bscMainnet;
  } else if (process.env.BLOCKCHAIN == "polygon") {
    return allAddresses.polygonMainnet;
  } else {
    return allAddresses.mainnet;
  }
};

export const getStrategyName = () => {
  if (process.env.BLOCKCHAIN == "bsc") {
    return "PancakeStrategy";
  } else {
    return "UniswapStrategy";
  }
};

export const getAddress = (hre: HardhatRuntimeEnvironment) => {
  if (hre.network.name == "rinkeby") {
    return allAddresses.rinkeby;
  } else if (hre.network.name == "ropsten") {
    return allAddresses.ropsten;
  } else {
    return getAddresses();
  }
};

export const keccak256 = ethers.utils.keccak256;

export const ZERO_BIGNUMBER = ethers.constants.Zero;
export const ZERO_ADDRESS = ethers.constants.AddressZero;

const enrollment = 60 * 60 * 24 * 7;
const duration = 60 * 60 * 24 * 14;
const hurdle = 11000;

export const DEFAULT_VAULT_PARAMS: VAULT_PARAMS = {
  strategy: ZERO_ADDRESS,
  strategist: ZERO_ADDRESS,
  seniorAsset: allAddresses.mainnet.assets.usdc,
  juniorAsset: allAddresses.mainnet.assets.weth,
  hurdleRate: hurdle,
  startTime: 0,
  enrollment: enrollment,
  duration: duration,
  seniorName: "Senior",
  seniorSym: "SR",
  juniorName: "Junior",
  juniorSym: "JR",
  seniorTrancheCap: ZERO_BIGNUMBER,
  seniorUserCap: ZERO_BIGNUMBER,
  juniorTrancheCap: ZERO_BIGNUMBER,
  juniorUserCap: ZERO_BIGNUMBER,
};

export type VAULT_PARAMS = {
  seniorAsset: string;
  juniorAsset: string;
  strategist: string;
  strategy: string;
  hurdleRate: ethers.BigNumberish;
  startTime: ethers.BigNumberish;
  enrollment: ethers.BigNumberish;
  duration: ethers.BigNumberish;
  seniorName: string;
  seniorSym: string;
  juniorName: string;
  juniorSym: string;
  seniorTrancheCap: ethers.BigNumberish;
  seniorUserCap: ethers.BigNumberish;
  juniorTrancheCap: ethers.BigNumberish;
  juniorUserCap: ethers.BigNumberish;
};

/**
 * Function to create a vault with only subset provided as overrides
 * @param vault an AllPaiVault instance to create the vault in
 * @param options takes any subset of VAULT_PARAMS type and populates default values if not provided
 * @returns {id, investAt, harvestAt, redeemAt, params}
 */
export const createVault = async (
  vault: AllPairVault,
  options: Partial<VAULT_PARAMS>
) => {
  const params: VAULT_PARAMS = { ...DEFAULT_VAULT_PARAMS, ...options };
  const investAt = (params.startTime as number) + enrollment;
  const harvestAt = investAt + duration / 7;
  const redeemAt = investAt + duration;
  await vault.createVault(params);
  const id = getVaultId([
    params.seniorAsset,
    params.juniorAsset,
    params.strategy,
    params.hurdleRate as number,
    params.startTime as number,
    investAt,
    redeemAt,
  ]);

  return {
    id,
    investAt,
    harvestAt,
    redeemAt,
    params,
  };
};
