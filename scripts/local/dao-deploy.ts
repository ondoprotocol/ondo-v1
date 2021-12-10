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
  ROLLOVER_ROLE,
  STRATEGIST_ROLE,
  STRATEGY_ROLE,
  VAULT_ROLE,
} from "../utils/constants";

const provider = new JsonRpcProvider("http://localhost:8545");

const proposalThreshold = BigNumber.from(10).pow(18).mul(50000);

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
  timelock = await timelockFactory.deploy(signer.address, 2 * 24 * 60 * 60);
  ondoToken = await ondoFactory.deploy(signer.address);
  await ondoToken.delegate(signer.address);
  const governanceImpl = await delegateFactory.deploy();
  const delegator = await delegatorFactory.deploy(
    timelock.address,
    ondoToken.address,
    signer.address,
    governanceImpl.address,
    5760,
    1,
    proposalThreshold
  );
  dao = new GovernorBravoDelegate__factory()
    .attach(delegator.address)
    .connect(signer);
  await timelock.setPendingAdmin(dao.address);
  await dao._initiate();
  trancheToken = await trancheTokenFactory.deploy();
  registry = await registryFactory.deploy(timelock.address, signer.address);
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
  await dao.propose(
    [registry.address, registry.address],
    [0, 0],
    ["grantRole(bytes32,address)", "grantRole(bytes32,address)"],
    [
      "0x" +
        registry.interface
          .encodeFunctionData("grantRole", [CREATOR_ROLE, signer.address])
          .slice(10),
      "0x" +
        registry.interface
          .encodeFunctionData("grantRole", [STRATEGIST_ROLE, signer.address])
          .slice(10),
    ],
    "Grant initial ACL roles"
  );
  await provider.send("evm_mine", []);
  await dao.castVote(1, 1);
  let i = 0;
  while (i <= 5761) {
    await provider.send("evm_mine", []);
    i++;
  }
  await dao.connect(signer).queue(1);
  await provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
  await dao.connect(signer).execute(1);
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
    dao: dao.address,
    ondo: ondoToken.address,
  };
  writeFileSync("deployed/contracts.json", JSON.stringify(contracts, null, 2));
}

main();
