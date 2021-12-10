require("dotenv").config();
import { writeFileSync } from "fs";
import { Wallet, BigNumber } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  AllPairVault,
  AllPairVault__factory,
  Registry,
  Registry__factory,
  UniswapStrategy,
  UniswapStrategy__factory,
  SushiStrategyLP,
  SushiStrategyLP__factory,
  RolloverVault,
  RolloverVault__factory,
  TrancheToken,
  TrancheToken__factory,
  Ondo,
  Ondo__factory,
  GovernorBravoDelegate,
  GovernorBravoDelegate__factory,
  GovernorBravoDelegator__factory,
  Timelock,
  Timelock__factory,
} from "../../typechain";
import { get_signers } from "../../test/utils/signing";
import { mainnet } from "../utils/addresses";
import { defaultAbiCoder } from "ethers/lib/utils";
import {
  CREATOR_ROLE,
  DEPLOYER_ROLE,
  ROLLOVER_ROLE,
  STRATEGIST_ROLE,
  STRATEGY_ROLE,
  VAULT_ROLE,
} from "../utils/constants";

const provider = new JsonRpcProvider("http://localhost:8545");

const proposalThreshold = BigNumber.from(10).pow(18).mul(50000);
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

export default async function main() {
  let registry: Registry;
  let vault: AllPairVault;
  let uniStrategy: UniswapStrategy;
  let rollover: RolloverVault;
  let sushiStrategy: SushiStrategyLP;
  let signers: Wallet[];
  let trancheToken: TrancheToken;
  let ondoToken: Ondo;
  let dao: GovernorBravoDelegate;
  let timelock: Timelock;
  signers = await get_signers(process.env.MNEMONIC!, provider);
  const signer = signers[0];
  const registryFactory = new Registry__factory(signer);
  const vaultFactory = new AllPairVault__factory(signer);
  const uniStratFactory = new UniswapStrategy__factory(signer);
  const sushiStratFactory = new SushiStrategyLP__factory(signer);
  const rolloverFactory = new RolloverVault__factory(signer);
  const trancheTokenFactory = new TrancheToken__factory(signer);
  const timelockFactory = new Timelock__factory(signer);
  const ondoFactory = new Ondo__factory(signer);
  const delegateFactory = new GovernorBravoDelegate__factory(signer);
  const delegatorFactory = new GovernorBravoDelegator__factory(signer);
  trancheToken = await trancheTokenFactory.deploy();
  registry = await registryFactory.deploy(signer.address, signer.address, WETH);
  vault = await vaultFactory.deploy(registry.address, trancheToken.address);
  uniStrategy = await uniStratFactory.deploy(
    registry.address,
    mainnet.uniswap.router,
    mainnet.uniswap.factory
  );
  sushiStrategy = await sushiStratFactory.deploy(
    registry.address,
    mainnet.sushi.router,
    mainnet.sushi.chef,
    mainnet.sushi.factory,
    mainnet.sushi.token,
    mainnet.sushi.xsushi
  );

  await registry.grantRole(DEPLOYER_ROLE, signer.address);
  await registry.grantRole(CREATOR_ROLE, signer.address);
  await registry.grantRole(STRATEGIST_ROLE, signer.address);
  await registry.grantRole(STRATEGY_ROLE, uniStrategy.address);
  await registry.grantRole(STRATEGY_ROLE, sushiStrategy.address);
  await registry.grantRole(VAULT_ROLE, vault.address);
  rollover = await rolloverFactory.deploy(
    vault.address,
    registry.address,
    trancheToken.address
  );
  await registry.grantRole(ROLLOVER_ROLE, rollover.address);
  const contracts = {
    registry: registry.address,
    vault: vault.address,
    uniStrat: uniStrategy.address,
    sushiStrat: sushiStrategy.address,
    rollover: rollover.address,
    trancheToken: trancheToken.address,
  };
  writeFileSync("deployed/contracts.json", JSON.stringify(contracts, null, 2));
}

main();
