export const getMainnetRpcUrl = () => {
  if (process.env.BLOCKCHAIN == "bsc") {
    return process.env.MAINNET_RPC_URL_BSC!;
  } else if (process.env.BLOCKCHAIN == "polygon") {
    return process.env.MAINNET_RPC_URL_POLYGON!;
  } else {
    return process.env.MAINNET_RPC_URL!;
  }
};

export const getBlockNumber = () => {
  if (process.env.BLOCKCHAIN == "bsc") {
    return undefined;
  } else {
    return process.env.FORK_FROM_BLOCK_NUMBER
      ? parseInt(process.env.FORK_FROM_BLOCK_NUMBER)
      : 13537712;
  }
};

export const getPrivateKey = (networkType: string) => {
  const privateKey =
    process.env[
      process.env.BLOCKCHAIN!.toUpperCase() +
        "_" +
        networkType.toUpperCase() +
        "_PRIVATE_KEY"
    ];
  if (privateKey && privateKey !== "") {
    return [privateKey];
  } else {
    return [process.env.MAINNET_PRIVATE_KEY!];
  }
};

export const getDeployPaths = () => {
  let paths = "deploy";
  if (process.env.BLOCKCHAIN != "ethereum") {
    paths = process.env.BLOCKCHAIN! + "/deploy";
  }
  return paths;
};

export const getContractsFolder = () => {
  if (process.env.BLOCKCHAIN != "ethereum") {
    return process.env.BLOCKCHAIN! + "/contracts";
  } else {
    return "contracts";
  }
};

export const getTestsFolder = () => {
  if (process.env.BLOCKCHAIN != "ethereum") {
    return process.env.BLOCKCHAIN! + "/test";
  } else {
    return "test";
  }
};
