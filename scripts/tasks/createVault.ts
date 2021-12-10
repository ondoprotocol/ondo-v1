import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { BigNumberish } from "ethers";
import {
  getAddress,
  createVault,
  VAULT_PARAMS,
  DEFAULT_VAULT_PARAMS,
} from "../utils/helpers";
import { exitIf } from "./utils";
import { strategies } from "./libs/strategies";
import { STRATEGIST_ROLE } from "../utils/constants";

task("createVault", "Create a new vault")
  .addParam("seniorAsset", "Input the senior asset", undefined, types.string)
  .addParam("juniorAsset", "Input the junior asset", undefined, types.string)
  .addParam("strategist", "Input the strategist address", "", types.string)
  .addParam("strategy", "Input the strategy name", undefined, types.string)
  .addParam(
    "hurdleRate",
    "Input the hurdle rate. The denominator is 10000. 12000 would be 120% or 20% profit for senior.",
    DEFAULT_VAULT_PARAMS.hurdleRate,
    types.int
  )
  .addParam(
    "startTime",
    "Input the start time from the current latest block timestamp.",
    100,
    types.int
  )
  .addParam(
    "enrollment",
    "Input the enrollment",
    DEFAULT_VAULT_PARAMS.enrollment,
    types.int
  )
  .addParam(
    "duration",
    "Input the duration",
    DEFAULT_VAULT_PARAMS.duration,
    types.int
  )
  .addParam(
    "seniorName",
    "Input the senior token name",
    DEFAULT_VAULT_PARAMS.seniorName,
    types.string
  )
  .addParam(
    "seniorSym",
    "Input the senior token symbol",
    DEFAULT_VAULT_PARAMS.seniorSym,
    types.string
  )
  .addParam(
    "juniorName",
    "Input the junior token name",
    DEFAULT_VAULT_PARAMS.juniorName,
    types.string
  )
  .addParam(
    "juniorSym",
    "Input the junior token symbol",
    DEFAULT_VAULT_PARAMS.juniorSym,
    types.string
  )
  .addParam(
    "seniorTrancheCap",
    "Input senior test caps on the tranches",
    0,
    types.int
  )
  .addParam(
    "juniorTrancheCap",
    "Input junior test caps on the tranches",
    0,
    types.int
  )
  .addParam("seniorUserCap", "Input senior test caps on users", 0, types.int)
  .addParam("juniorUserCap", "Input junior test caps on users", 0, types.int)
  .addOptionalParam(
    "sushiPoolId",
    "Input sushi masterchef poolId (avaialble for sushi strategies)",
    undefined,
    types.int
  )
  .addOptionalParam(
    "pathFromSushi",
    "Input the path from sushi using comma. (avaialble for sushi strategies)",
    undefined,
    types.string
  )
  .addOptionalParam(
    "pathFromSecondReward",
    "Input the path from second reward token using comma. (avaialble for sushi staking v2 strategy)",
    undefined,
    types.string
  )
  .addOptionalParam(
    "creator",
    "Input the creator address",
    undefined,
    types.string
  )
  .setAction(
    async (
      args: VAULT_PARAMS & {
        creator?: string;
      } & {
        sushiPoolId?: BigNumberish;
        pathFromSushi?: string;
        pathFromSecondReward?: string;
      }
    ) => {
      const hre: HardhatRuntimeEnvironment = require("hardhat");
      const ethers = hre.ethers;

      // load addresses
      const address = getAddress(hre);

      exitIf(
        !Object.keys(address.assets).includes(args.seniorAsset.toLowerCase()),
        "Invalid senior asset: " + args.seniorAsset
      );
      exitIf(
        !Object.keys(address.assets).includes(args.juniorAsset.toLowerCase()),
        "Invalid junior asset: " + args.juniorAsset
      );
      exitIf(
        args.hurdleRate < 0 || args.hurdleRate >= 20000,
        "Invalid hurdleRate: " + args.hurdleRate
      );
      exitIf(args.startTime < 0, "Invalid startTime: " + args.startTime);
      exitIf(args.enrollment < 0, "Invalid enrollment: " + args.enrollment);
      exitIf(args.duration < 0, "Invalid duration: " + args.duration);
      exitIf(
        args.seniorTrancheCap < 0,
        "Invalid seniorTrancheCap: " + args.seniorTrancheCap
      );
      exitIf(
        args.juniorTrancheCap < 0,
        "Invalid juniorTrancheCap: " + args.juniorTrancheCap
      );
      exitIf(
        args.seniorUserCap < 0,
        "Invalid seniorUserCap: " + args.seniorUserCap
      );
      exitIf(
        args.juniorUserCap < 0,
        "Invalid juniorUserCap: " + args.juniorUserCap
      );

      // create vault params
      await ethers.provider.send("evm_mine", []);
      const now: number = (await ethers.provider.getBlock("latest")).timestamp;
      let vault: VAULT_PARAMS = {
        seniorAsset: (address.assets as any)[args.seniorAsset.toLowerCase()],
        juniorAsset: (address.assets as any)[args.juniorAsset.toLowerCase()],
        strategist: args.strategist,
        strategy: args.strategy,
        hurdleRate: args.hurdleRate,
        startTime: ethers.BigNumber.from(now).add(args.startTime),
        enrollment: args.enrollment,
        duration: args.duration,
        seniorName: args.seniorName,
        seniorSym: args.seniorSym,
        juniorName: args.juniorName,
        juniorSym: args.juniorSym,
        seniorTrancheCap: args.seniorTrancheCap,
        juniorTrancheCap: args.juniorTrancheCap,
        seniorUserCap: args.seniorUserCap,
        juniorUserCap: args.juniorUserCap,
      };

      const signers: SignerWithAddress[] = await ethers.getSigners();

      // update strategist
      if (!args.strategist) {
        vault.strategist = signers[0].address;
      }

      exitIf(
        !Object.keys(strategies).includes(args.strategy.toLowerCase()),
        "Invalid strategy: " + args.strategy
      );

      vault.strategy = await strategies[args.strategy.toLowerCase()](
        hre,
        address,
        {
          juniorAsset: vault.juniorAsset,
          seniorAsset: vault.seniorAsset,
          sushiPoolId: args.sushiPoolId,
          pathFromSushi: args.pathFromSushi,
          pathFromSecondReward: args.pathFromSecondReward,
        }
      );

      // create vault
      const allPair = await ethers.getContract("AllPairVault");

      let creator;
      if (args.creator) {
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [args.creator],
        });
        creator = await ethers.getSigner(args.creator);
      } else {
        creator = signers[0];
      }

      const registry = await ethers.getContract("Registry");
      if (
        !(await registry.callStatic.authorized(
          STRATEGIST_ROLE,
          vault.strategist
        ))
      ) {
        await registry
          .connect(creator)
          .addStrategist(vault.strategist, "New Strategist");
      }

      let { id: vaultId } = await createVault(allPair, vault, creator);
      console.log("Created Vault: ", vaultId.toHexString());

      return vaultId.toHexString();
    }
  );
