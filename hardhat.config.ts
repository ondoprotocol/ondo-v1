require("dotenv").config();
import { task, HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import * as multichain from "./scripts/utils/multichain";

import "./scripts/tasks/createVault";
import "./scripts/tasks/swap";
import "./scripts/tasks/deposit";
import "./scripts/tasks/invest";
import "./scripts/tasks/redeem";
import "./scripts/tasks/vaultInfo";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();
  for (const account of accounts) {
    console.log(await account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.3",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      accounts: { mnemonic: process.env.MNEMONIC },
      forking: {
        url: multichain.getMainnetRpcUrl(),
        blockNumber: multichain.getBlockNumber(),
      },
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1337,
    },
    ropsten: {
      accounts: [process.env.TESTNET_PRIVATE_KEY!],
      timeout: 60 * 30 * 1000,
      url: process.env.ROPSTEN_RPC_URL!,
      gas: 5000000,
    },
    rinkeby: {
      accounts: [process.env.TESTNET_PRIVATE_KEY!],
      url: process.env.RINKEBY_RPC_URL,
      gas: 5000000,
    },
    mainnet: {
      accounts: [process.env.MAINNET_PRIVATE_KEY!],
      url: multichain.getMainnetRpcUrl(),
      gas: 6000000,
    },
    bsc: {
      url: process.env.BSC_RPC_URL!,
      accounts: multichain.getPrivateKey("mainnet"),
      chainId: 56,
      live: true,
      saveDeployments: true,
    },
    "bsc-testnet": {
      url: process.env.BSC_TESTNET_RPC_URL!,
      accounts: multichain.getPrivateKey("testnet"),
      chainId: 97,
      live: true,
      saveDeployments: true,
      gasMultiplier: 2,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL!,
      accounts: multichain.getPrivateKey("mainnet"),
      chainId: 137,
      live: true,
      saveDeployments: true,
    },
    mumbai: {
      // Polygon testnet.
      url: process.env.MUMBAI_RPC_URL!,
      accounts: multichain.getPrivateKey("testnet"),
      chainId: 80001,
      live: true,
      saveDeployments: true,
      gasMultiplier: 2,
    },
  },
  mocha: {
    timeout: 60 * 30 * 1000,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  namedAccounts: {
    deployer: 0,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  paths: {
    deploy: multichain.getDeployPaths(),
    sources: multichain.getContractsFolder(),
    tests: multichain.getTestsFolder(),
  },
};

export default config;
