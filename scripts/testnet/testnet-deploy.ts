require("dotenv").config();
import * as hardhat from "hardhat";
import {
  AllPairVault__factory,
  Registry__factory,
  SushiStrategyLP__factory,
  TrancheToken__factory,
  UniswapStrategy__factory,
} from "../../typechain";
import { Addresses } from "../utils/addresses";
import { writeFileSync } from "fs";
import {
  CREATOR_ROLE,
  DEPLOYER_ROLE,
  STRATEGIST_ROLE,
  STRATEGY_ROLE,
  VAULT_ROLE,
} from "../utils/constants";

export async function main(
  network: string,
  addresses: Addresses,
  blockGasLimit: number
) {
  const [deployer] = await hardhat.ethers.getSigners();
  console.log(JSON.stringify(deployer));
  const registryFactory = new Registry__factory(deployer);
  const trancheTokenFactory = new TrancheToken__factory(deployer);
  const vaultFactory = new AllPairVault__factory(deployer);
  const uniFactory = new UniswapStrategy__factory(deployer);
  const sushiFactory = new SushiStrategyLP__factory(deployer);
  console.log("START DEPLOYMENTS");
  // const registryDeployTx = registryFactory.getDeployTransaction(
  //   deployer.address,
  //   deployer.address
  // );
  // const receipt = (await deployer.sendTransaction(registryDeployTx)).wait();
  // console.log(JSON.stringify(receipt));
  const registry = await registryFactory.deploy(
    deployer.address,
    deployer.address,
    addresses.assets.weth
  );
  console.log(`DEPLOYED REGISTRY AT ${registry.address}`);
  const trancheToken = await trancheTokenFactory.deploy();
  console.log(`DEPLOYED TRANCHE TOKEN AT ${trancheToken.address}`);

  const vault = await vaultFactory.deploy(
    registry.address,
    trancheToken.address,
    {
      gasLimit: blockGasLimit,
    }
  );
  console.log(`DEPLOYED VAULT AT ${vault.address}`);

  const uniStrat = await uniFactory.deploy(
    registry.address,
    addresses.uniswap.router,
    addresses.uniswap.factory,
    {
      gasLimit: blockGasLimit,
    }
  );
  console.log(`DEPLOYED UNI AT ${uniStrat.address}`);

  // const sushiStrat = await sushiFactory.deploy(
  //   registry.address,
  //   addresses.sushi.router,
  //   addresses.sushi.chef,
  //   addresses.sushi.factory,
  //   addresses.sushi.token,
  //   addresses.sushi.xsushi,
  //   {
  //     gasLimit: blockGasLimit,
  //   }
  // );
  // console.log(`DEPLOYED SUSHI AT ${sushiStrat.address}`);

  await registry
    .grantRole(STRATEGIST_ROLE, deployer.address, {
      gasLimit: 100000,
    })
    .catch((e) => {
      console.log("STRATEGIST ROLE ERROR");
    });
  await registry
    .grantRole(CREATOR_ROLE, deployer.address, {
      gasLimit: 100000,
    })
    .catch((e) => {
      console.log("CREATOR ROLE ERROR");
    });
  await registry
    .grantRole(DEPLOYER_ROLE, deployer.address, {
      gasLimit: 100000,
    })
    .catch((e) => {
      console.log("DEPLOYER ROLE ERROR");
    });
  await registry
    .grantRole(STRATEGY_ROLE, uniStrat.address, {
      gasLimit: 100000,
    })
    .catch((e) => {
      console.log("UNISTRATEGY ROLE ERROR");
    });
  // await registry
  //   .grantRole(
  //     STRATEGY_ROLE,
  //     sushiStrat.address,
  //     {
  //       gasLimit: 100000,
  //     }
  //   )
  //   .catch((e) => {
  //     console.log("SUSHISTRATEGY ROLE ERROR");
  //   });
  await registry
    .grantRole(VAULT_ROLE, vault.address, {
      gasLimit: 100000,
    })
    .catch((e) => {
      console.log("VAULT ROLE ERROR");
    });
  console.log("GRANTED ROLES");

  const contracts = {
    registry: registry.address,
    vault: vault.address,
    uniStrategy: uniStrat.address,
    // sushiStrategy: sushiStrat.address,
  };
  console.log(JSON.stringify(contracts));
  writeFileSync(
    `deployed/${network}-addresses.json`,
    JSON.stringify(contracts, null, 2)
  );
}
