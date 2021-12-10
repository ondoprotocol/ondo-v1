
*How to use the deploy scripts*

In terminal 1, run a local node:
`yarn --silent hardhat node` 

This will automatically run deploy/001_deploy_contracts.ts. 

You will see the addresses of all deployed contracts printed out. This should not change unless the contracts change. 

In terminal 2, run the following script: 

`yarn --silent hardhat --network localhost run scripts/createVault.ts`

This will create a new vault and print out the vault ID (I hope the ID is correct!). Unfortunately, all the parameters for the vault are hard-coded in that script. Hopefully someone can figure out how to pass args into this script. 

The web app now allows you to call `invest` and `redeem` by adding `/admin` to the webapp url. 

To get the tokens you need, call this script. The values are hard-coded. Change to the token you want for ETH. 

`yarn --silent hardhat --network localhost run scripts/swap.ts` 

Finally, sometimes you'll get an error that it's not yet time to move to invest or redeem. Sometimes this is because the Hardhat node doesn't move the timestamp forward. Use this script:

`yarn --silent hardhat --network localhost run scripts/mine.ts` 

*Manual testing*

In terminal 3, run this command: 

`yarn --silent hardhat --network localhost console`

This will open a REPL where you can directly interact with contracts. Fortunately, the hardhat-deploy plugin makes this easier to use. To get AllPairVault: 

```
> let allPair = await ethers.getContract("AllPairVault"); 
> await allPair.invest(yourVaultID, 0, 0);
```

*Future Directions*

Ideally, we should have a CLI command language for interacting with the contracts. For example, `ondo create --strategy sushiswap --hurdleRate 12000` or `ondo list --allVaults` or `ondo invest --vaultId 0x3234243 --minSenior 0 --minJunior 0`. 

To do this we need to pass arguments to these scripts. There's a way to do this, but hardhat-deploy seems to not expose ether unless you run it under `hardhat run`. 


