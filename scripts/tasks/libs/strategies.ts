import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Addresses } from "../../utils/addresses";
import { exitIf } from "../utils";

export type StrategyArgs = {
  juniorAsset: string;
  seniorAsset: string;
};

export const createUniswapStrategy = async (
  hre: HardhatRuntimeEnvironment,
  address: Addresses,
  args: StrategyArgs
) => {
  const uniStrategy = await hre.ethers.getContract("UniswapStrategy");
  return uniStrategy.address;
};

export type SushiLPStrategyArgs = StrategyArgs & {
  sushiPoolId?: BigNumberish;
  pathFromSushi?: string;
};

export const createSushiswapLPStrategy = async (
  hre: HardhatRuntimeEnvironment,
  address: Addresses,
  args: SushiLPStrategyArgs
) => {
  const { ethers } = hre;

  exitIf(args.sushiPoolId == undefined, "Missing argument --sushi-pool-id");
  exitIf(!args.pathFromSushi, "Missing argument --path-from-sushi");
  exitIf(args.sushiPoolId! < 0, "Invalid sushiPoolId: " + args.sushiPoolId);

  // calculate pathFromSushi
  const pathFromSushi = [];
  for (const asset of args.pathFromSushi!.split(",")) {
    exitIf(
      !Object.keys(address.assets).includes(asset.toLowerCase()),
      "Invalid sushi path asset: " + asset
    );

    pathFromSushi.push((address.assets as any)[asset.toLowerCase()]);
  }

  // calculate sushi poolAddress
  const IUniswapV2Factory = await hre.artifacts.readArtifact(
    "IUniswapV2Factory"
  );
  const sushiFactory = await ethers.getContractAt(
    IUniswapV2Factory.abi,
    address.sushi.factory
  );
  const sushiPoolAddress = await sushiFactory.getPair(
    args.seniorAsset,
    args.juniorAsset
  );

  // update strategy
  const sushiStrategy = await ethers.getContract("SushiStrategyLP");

  if (!(await sushiStrategy.pools(sushiPoolAddress))._isSet) {
    await sushiStrategy.addPool(
      sushiPoolAddress,
      args.sushiPoolId,
      pathFromSushi
    );
  }

  return sushiStrategy.address;
};

export type SushiStakinvV2StrategyArgs = StrategyArgs & {
  sushiPoolId?: BigNumberish;
  pathFromSushi?: string;
  pathFromSecondReward?: string;
};

export const createSushiswapStakingV2Strategy = async (
  hre: HardhatRuntimeEnvironment,
  address: Addresses,
  args: SushiStakinvV2StrategyArgs
) => {
  const { ethers } = hre;

  exitIf(args.sushiPoolId == undefined, "Missing argument --sushi-pool-id");
  exitIf(!args.pathFromSushi, "Missing argument --path-from-sushi");
  exitIf(
    !args.pathFromSecondReward,
    "Missing argument --path-from-second-reward"
  );
  exitIf(args.sushiPoolId! < 0, "Invalid sushiPoolId: " + args.sushiPoolId);

  // calculate pathFromSushi
  const pathFromSushi = [];
  for (const asset of args.pathFromSushi!.split(",")) {
    exitIf(
      !Object.keys(address.assets).includes(asset.toLowerCase()),
      "Invalid sushi path asset: " + asset
    );

    pathFromSushi.push((address.assets as any)[asset.toLowerCase()]);
  }
  const pathFromSecondReward = [];
  for (const asset of args.pathFromSecondReward!.split(",")) {
    exitIf(
      !Object.keys(address.assets).includes(asset.toLowerCase()),
      "Invalid second reward path asset: " + asset
    );

    pathFromSecondReward.push((address.assets as any)[asset.toLowerCase()]);
  }

  // calculate sushi poolAddress
  const IUniswapV2Factory = await hre.artifacts.readArtifact(
    "IUniswapV2Factory"
  );
  const sushiFactory = await ethers.getContractAt(
    IUniswapV2Factory.abi,
    address.sushi.factory
  );
  const sushiPoolAddress = await sushiFactory.getPair(
    args.seniorAsset,
    args.juniorAsset
  );

  // update strategy
  const sushiStrategy = await ethers.getContract("SushiStakingV2Strategy");
  const rewardHandler = await ethers.getContract("AlchemixUserReward");

  if (!(await sushiStrategy.pools(sushiPoolAddress))._isSet) {
    await sushiStrategy.addPool(
      sushiPoolAddress,
      args.sushiPoolId,
      [pathFromSushi, pathFromSecondReward],
      rewardHandler.address
    );
  }

  return sushiStrategy.address;
};

export const strategies: {
  [name: string]: (
    hre: HardhatRuntimeEnvironment,
    address: Addresses,
    args: StrategyArgs | SushiLPStrategyArgs | SushiStakinvV2StrategyArgs
  ) => Promise<string>;
} = {
  uniswap: createUniswapStrategy,
  sushiswap: createSushiswapLPStrategy,
  sushistakingv2: createSushiswapStakingV2Strategy,
};
