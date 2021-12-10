export interface Uniswap {
  router: string;
  factory: string;
  uniWeth: string;
  token: string;
}

export const pancakeswap: DexAddresses = {
  router: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
  token: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
  chef: "0x73feaa1eE314F8c655E354234017bE2193C9E24E",
  factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
  staking: "",
  chef2: "",
};

export const quickswapLP: DexAddresses = {
  router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  token: "0x831753DD7087CaC61aB5644b308642cc1c33Dc13",
  chef: "0x5eec262b05a57da9beb5fe96a34aa4ed0c5e029f", // StakingRewardsFactory
  factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
  staking: "0xf28164a485b0b2c90639e47b0f377b4a438a16b1", // dQuick/DragonLair
  chef2: "",
};

export const uniswap: Uniswap = {
  router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  uniWeth: "0x4e99615101ccbb83a462dc4de2bc1362ef1365e5",
  token: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
};

export const pancake: Uniswap = {
  router: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
  factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
  uniWeth: "0x0ed7e52944161450477ee417de9cd3a859b14fd0", // cake-wbnb
  token: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", // cake
};

export const quickswap: Uniswap = {
  router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
  uniWeth: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // matic WETH
  token: "0x831753DD7087CaC61aB5644b308642cc1c33Dc13", // quick
};

const zero: string = "0x" + "0".repeat(40);

export const mainnet: Addresses = {
  sushi: {
    router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    token: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
    chef: "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd",
    factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
    xsushi: "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272",
    chef2: "0xef0881ec094552b2e128cf945ef17a6752b4ec5d",
  },
  uniswap,
  zero,
  assets: {
    dai: "0x6b175474e89094c44da98b954eedeac495271d0f",
    wbtc: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    badger: "0x3472A5A71965499acd81997a54BBA8D852C6E53d",
    tbtc: "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa",
    weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    link: "0x514910771af9ca656af840dff83e8264ecf986ca",
    usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  },
  alchemix: {
    token: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    pool: "0xAB8e74017a8Cc7c15FFcCd726603790d26d7DeCa",
    slp: "0xc3f279090a47e80990fe3a9c30d24cb117ef91a8",
  },
};

export const rinkeby: Addresses = {
  sushi: {
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    chef: "0x80C7DD17B01855a6D2347444a0FCC36136a314de",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    token: "0x0769fd68dFb93167989C6f7254cd0D766Fb2841F",
    xsushi: "0x1be211D8DA40BC0ae8719c6663307Bfc987b1d6c",
    chef2: "",
  },
  uniswap,
  zero,
  assets: {
    dai: "0x6b175474e89094c44da98b954eedeac495271d0f",
    wbtc: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    badger: "0x3472A5A71965499acd81997a54BBA8D852C6E53d",
    tbtc: "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa",
    weth: "0xc778417e063141139fce010982780140aa0cd5ab",
    link: "",
    usdt: "",
  },
  alchemix: {
    token: "",
    slp: "",
    pool: "",
  },
};

export const ropsten: Addresses = {
  sushi: {
    router: "",
    factory: "",
    token: "",
    chef: "",
    xsushi: "",
    chef2: "",
  },
  uniswap,
  zero: zero,
  assets: {
    dai: "0x6b175474e89094c44da98b954eedeac495271d0f",
    wbtc: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    badger: "0x3472A5A71965499acd81997a54BBA8D852C6E53d",
    tbtc: "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa",
    weth: "0xc778417e063141139fce010982780140aa0cd5ab",
    link: "",
    usdt: "",
  },
  alchemix: {
    token: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    pool: "0xAB8e74017a8Cc7c15FFcCd726603790d26d7DeCa",
    slp: "0xc3f279090a47e80990fe3a9c30d24cb117ef91a8",
  },
};

export const bscMainnet: Addresses = {
  sushi: {
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    token: "",
    chef: "",
    xsushi: "",
    chef2: "",
  },
  uniswap: pancake,
  zero,
  // TODO
  assets: {
    dai: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", // +
    wbtc: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    badger: "0x3472A5A71965499acd81997a54BBA8D852C6E53d",
    tbtc: "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa",
    weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // + wbnb
    link: "0x514910771af9ca656af840dff83e8264ecf986ca",
    usdt: "0x55d398326f99059ff775485246999027b3197955",
  },
  // TODO
  alchemix: {
    token: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    pool: "0xAB8e74017a8Cc7c15FFcCd726603790d26d7DeCa",
    slp: "0xc3f279090a47e80990fe3a9c30d24cb117ef91a8",
  },
};

export const polygonMainnet: Addresses = {
  sushi: {
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    token: "",
    chef: "",
    xsushi: "",
    chef2: "",
  },
  uniswap: quickswap,
  zero,
  assets: {
    dai: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // +
    wbtc: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
    usdc: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    badger: "0x1fcbe5937b0cc2adf69772d228fa4205acf4d9b2", // TODO: double-check this address
    tbtc: "",
    weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // wmatic
    link: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39",
    usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
  },
  // TODO
  alchemix: {
    token: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    pool: "0xAB8e74017a8Cc7c15FFcCd726603790d26d7DeCa",
    slp: "0xc3f279090a47e80990fe3a9c30d24cb117ef91a8",
  },
};

export interface DexAddresses {
  router: string;
  token: string;
  chef: string;
  factory: string;
  staking: string;
  chef2: string;
}

export interface Addresses {
  sushi: {
    router: string;
    token: string;
    chef: string;
    factory: string;
    xsushi: string;
    chef2: string;
  };
  uniswap: Uniswap;
  zero: string;
  assets: {
    dai: string;
    wbtc: string;
    usdc: string;
    badger: string;
    tbtc: string;
    weth: string;
    link: string;
    usdt: string;
  };
  alchemix: {
    token: string;
    slp: string;
    pool: string;
  };
}

export const getAmmAddresses = () => {
  if (process.env.BLOCKCHAIN == "bsc") {
    return pancakeswap;
  } else if (process.env.BLOCKCHAIN == "polygon") {
    return quickswapLP;
  } else {
    return uniswap;
  }
};
