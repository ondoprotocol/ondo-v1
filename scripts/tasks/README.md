# How to use the task scripts

## Create Vault

You can create vault with `createVault` task.

| Option                    | Description                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| --strategy                | Input the strategy name                                                                                         |
| --junior-asset            | Input the junior asset                                                                                          |
| --senior-asset            | Input the senior asset                                                                                          |
| --creator                 | Input the creator address                                                                                       |
| --duration                | Input the duration (default: 1209600)                                                                           |
| --enrollment              | Input the enrollment (default: 604800)                                                                          |
| --hurdle-rate             | Input the hurdle rate. The denominator is 10000. 12000 would be 120% or 20% profit for senior. (default: 11000) |
| --junior-name             | Input the junior token name (default: "Junior")                                                                 |
| --junior-sym              | Input the junior token symbol (default: "JR")                                                                   |
| --junior-tranche-cap      | Input junior test caps on the tranches (default: 0)                                                             |
| --junior-user-cap         | Input junior test caps on users (default: 0)                                                                    |
| --senior-name             | Input the senior token name (default: "Senior")                                                                 |
| --senior-sym              | Input the senior token symbol (default: "SR")                                                                   |
| --senior-tranche-cap      | Input senior test caps on the tranches (default: 0)                                                             |
| --senior-user-cap         | Input senior test caps on users (default: 0)                                                                    |
| --start-time              | Input the start time from the current latest block timestamp. (default: 100)                                    |
| --strategist              | Input the strategist address (default: "")                                                                      |
| --sushi-pool-id           | Input sushi masterchef poolId (avaialble for sushi strategies)                                                  |
| --path-from-second-reward | Input the path from second reward token using comma. (avaialble for sushi staking v2 strategy)                  |
| --path-from-sushi         | Input the path from sushi using comma. (avaialble for sushi strategies)                                         |

Usage:

Uniswap strategy

```
npx hardhat createVault --senior-asset USDT --junior-asset WETH --strategy Uniswap --network localhost --start-time 100
```

Sushiswap strategy

```
npx hardhat createVault --senior-asset WETH --junior-asset LINK --strategy sushiswap --start-time 600000 --sushi-pool-id 8 --path-from-sushi WETH --network localhost
```

SushiStakingV2 strategy

```
npx hardhat createVault --senior-asset WETH --junior-asset ALCX --strategy sushistakingv2 --start-time 600000 --sushi-pool-id 0 --path-from-sushi SUSHI,WETH --path-from-second-reward ALCX --network localhost
```

## Query Vaults

You can query all vaults with `vaultInfo` task.

| Flag             | Description                          |
| ---------------- | ------------------------------------ |
| --creator        | option to show creator               |
| --json           | option to show result in json format |
| --rollover       | option to show rollover              |
| --strategist     | option to show strategist            |
| --strategy       | option to show strategy              |
| --tokens         | option to show tokens                |
| --tranche-tokens | option to show tranche tokens        |

Usage:

```
npx hardhat vaultInfo --network localhost --tokens
npx hardhat vaultInfo --network localhost --tranche-tokens
npx hardhat vaultInfo --network localhost --tokens --tranche-tokens --strategy --creator --strategist --rollover --json
```

## Swap

You can swap tokens with `swap` task.

| Option   | Description                                  |
| -------- | -------------------------------------------- |
| --router | Input the router source (default: "Uniswap") |
| --from   | Input the source asset (default: "ETH")      |
| --to     | Input the destination asset                  |
| --amount | Input the amount to swap                     |
| --path   | Input the swap path                          |
| --only   | Input signer index                           |

Usage:

```
npx hardhat swap --to DAI --amount 1000000000000000000 --network localhost
npx hardhat swap --from DAI --to ETH --amount 1000000000000000000 --network localhost
npx hardhat swap --from DAI --to USDT --path DAI,WETH,USDT --amount 1000000000000000000 --network localhost
npx hardhat swap --from DAI --to USDT --path DAI,WETH,USDT --amount 1000000000000000000 --only 2 --network localhost
```

## Deposit

You can deposit to vault with `deposit` task.

| Option          | Description                           |
| --------------- | ------------------------------------- |
| --amount        | Input the tranche asset               |
| --asset         | Input the tranche asset               |
| --tranche-index | Input the tranche index (default: -1) |
| --user          | Input signer index (default: 0)       |
| --vault-id      | Input the vault id                    |

Usage:

```
npx hardhat deposit --vault-id 0x7c188c9a355b306cd3764a7045420babd5f856e469e45bf1070f057ed4192863 --asset USDT --amount 1000000 --user 0 --network localhost
npx hardhat deposit --vault-id 0x7c188c9a355b306cd3764a7045420babd5f856e469e45bf1070f057ed4192863 --asset WETH --amount 10000000000000000 --user 0 --network localhost
```

## Invest

You can invest to vault with `invest` task.

| Option     | Description                      |
| ---------- | -------------------------------- |
| --user     | Input signer index (default: 0)  |
| --vault-id | Input the vault id in hex string |

Usage:

```
npx hardhat invest --vault-id 0x019cdd2fb9cde6560bb972830150e731ea9bffc12741dedac4f88f1e84ca009a --network localhost
```

## Redeem

You can redeem from vault with `redeem` task.

| Option     | Description                      |
| ---------- | -------------------------------- |
| --user     | Input signer index (default: 0)  |
| --vault-id | Input the vault id in hex string |

Usage:

```
npx hardhat redeem --vault-id 0x7c188c9a355b306cd3764a7045420babd5f856e469e45bf1070f057ed4192863 --user 0 --network localhost
```

## Scenario

You can build a new scenario script based on above tasks. Use `[scenario1](https://github.com/ondoprotocol/protocol-dev/blob/develop/scripts/scenarios/scenario1.ts)` as a reference.

Usage:

```
./scripts/scenarios/scenario1.ts --network localhost
```
