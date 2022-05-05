> 💡 **Note: This repository is a one-time snapshot of our smart contract repository for our Immunefi bug bounty. The team develops and collaborates on a private repository for now.**

---

# Ondo

[![CI](https://github.com/ondoprotocol/ondo-protocol/actions/workflows/nodejs.yml/badge.svg)](https://github.com/ondoprotocol/ondo-protocol/actions/workflows/nodejs.yml)

## Install

```sh
yarn
```

## Building after changes to contracts

```sh
yarn compile
yarn compile:bsc
yarn compile:polygon
```

## Running tests

Add to .env (or use [direnv](https://direnv.net))

```sh
MAINNET_RPC_URL='https://eth-mainnet.alchemyapi.io/v2/api_key_here'
MAINNET_RPC_URL_POLYGON='https://polygon-mainnet.g.alchemy.com/v2/api_key_here'
MAINNET_RPC_URL_BSC='https://speedy-nodes-nyc.moralis.io/api_key_here/bsc/mainnet/archive'
MNEMONIC='test test test test test test test test test test test test'
MAINNET_PRIVATE_KEY='private_key'
TESTNET_PRIVATE_KEY='private_key'
BSC_TESTNET_PRIVATE_KEY='private_key'
POLYGON_TESTNET_PRIVATE_KEY='private_key'
REPORT_GAS=false
ROPSTEN_RPC_URL='https://eth-ropsten.alchemyapi.io/v2/api_key_here'
RINKEBY_RPC_URL='https://rinkeby.infura.io/v3/api_key_here'
BSC_RPC_URL='https://'
BSC_TESTNET_RPC_URL='https://'
POLYGON_RPC_URL='https://'
MUMBAI_RPC_URL='https://'
ETHERSCAN_API_KEY='api_key_here'
```

You may also need some other private keys if you wanna deploy contracts to other blockchains (see the full list in hardhat.config.ts).

then

```sh

# run tests
yarn test
yarn test:bsc
yarn test:polygon

# run one test
yarn test test/some-test.spec.ts
yarn test:bsc bsc/test/some-test.spec.ts
yarn test:polygon polygon/test/some-test.spec.ts
```

## Deployment

We are using `hardhat-deploy`. There are a number of scripts below `deploy/` for each chunk of functionality. To deploy the contracts required for softlaunch (i.e. no Rollover), run the following:

```sh
yarn deploy
yarn deploy:bsc
yarn deploy:mumbai
```

TODO: Replace the above with a more general mechanism.

Note: multiple tags don't work, but a bug has been filed.

## Run local Ethereum node

In a separate terminal, run hardhat's local node:

```sh
local-node
local-node:bsc
local-node:polygon
```

Run all the setup scripts in a different terminal:

```sh
yarn deploy:all
```

## Coverage

```sh
yarn coverage
yarn coverage:bsc
yarn coverage:polygon
```

See solidity-coverage's [hardhat docs](https://github.com/sc-forks/solidity-coverage/blob/master/HARDHAT_README.md) for more details.

See the full list of commands in package.json

## Gas reporting

This will run all tests and report on gas usage.

```sh
REPORT_GAS=true yarn hardhat test
```
