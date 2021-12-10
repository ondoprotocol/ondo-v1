import mainnetAssets from "./mainnet-assets.json";

interface Uniswap {
  router: string;
  factory: string;
  uniWeth: string;
  token: string;
  pools: { usdc_bond: string; weth_dpx: string; weth_rdpx: string };
}

const uniswap: Uniswap = {
  router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  uniWeth: "0x4e99615101ccbb83a462dc4de2bc1362ef1365e5",
  token: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  pools: {
    usdc_bond: "0x6591c4BcD6D7A1eb4E537DA8B78676C1576Ba244",
    weth_dpx: "0xf64af01A14c31164FF7381cF966df6f2B4cB349F",
    weth_rdpx: "0x0bf46ba06dc1d33c3bd80ff42497ebff13a88900",
  },
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
    pools: {
      cvx_eth: "0x05767d9ef41dc40689678ffca0608878fb3de906",
      eden_eth: "0x82DBc2673e9640343D263a3c55DE49021AD39aE2",
    },
  },
  uniswap,
  zero,
  assets: mainnetAssets.reduce(
    (acc, cur) => ({
      ...acc,
      [cur.symbol.toLowerCase()]: cur.address,
    }),
    {}
  ),
  alchemix: {
    token: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    pool: "0xAB8e74017a8Cc7c15FFcCd726603790d26d7DeCa",
    slp: "0xc3f279090a47e80990fe3a9c30d24cb117ef91a8",
  },
  cvx: {
    token: "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b",
    pool: "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332",
    slp: "0x05767d9EF41dC40689678fFca0608878fb3dE906",
    rewards: "0x9e01aaC4b3e8781a85b21d9d9F848e72Af77B362",
  },
  ygg: {
    token: "0x25f8087ead173b73d6e8b84329989a8eea16cf73",
    slp: "0x99B42F2B49C395D2a77D973f6009aBb5d67dA343",
  },
  bit: {
    token: "0x1a4b46696b2bb4794eb3d4c26f1c55f9170fa4c5",
    slp: "0xe12af1218b4e9272e9628d7c7dc6354d137d024e",
  },
  wsteth: {
    token: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    slp: "0xc5578194D457dcce3f272538D1ad52c68d1CE849",
  },
  ldo: {
    token: "0x5a98fcbea516cf06857215779fd812ca3bef1b32",
  },
  bond: {
    token: "0x0391D2021f89DC339F60Fff84546EA23E337750f",
    rewardStakingPool: "0xb0fa2beee3cf36a7ac7e99b885b48538ab364853",
    yieldFarm: "0xc25c37c387c5c909a94055f4f16184ca325d3a76",
  },
  eden: {
    token: "0x1559FA1b8F28238FD5D76D9f434ad86FD20D1559",
    rewardManager: "0x1751ACB6486F904b4Dca82dca76d69C96dfeFD8c",
  },
  dpx: {
    token: "0xEec2bE5c91ae7f8a338e1e5f3b5DE49d07AfdC81",
  },
  rdpx: {
    token: "0x0ff5a8451a839f5f0bb3562689d9a44089738d11 ",
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
    pools: {
      cvx_eth: "",
      eden_eth: "",
    },
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
  cvx: {
    token: "",
    slp: "",
    pool: "",
    rewards: "",
  },
  ygg: {
    token: "",
    slp: "",
  },
  bit: {
    token: "",
    slp: "",
  },
  wsteth: {
    token: "",
    slp: "",
  },
  ldo: {
    token: "",
  },
  bond: {
    token: "",
    rewardStakingPool: "",
    yieldFarm: "",
  },
  eden: {
    token: "",
    rewardManager: "",
  },
  dpx: {
    token: "",
  },
  rdpx: {
    token: "",
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
    pools: {
      cvx_eth: "",
      eden_eth: "",
    },
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
  cvx: {
    token: "",
    slp: "",
    pool: "",
    rewards: "",
  },
  ygg: {
    token: "",
    slp: "",
  },
  bit: {
    token: "",
    slp: "",
  },
  wsteth: {
    token: "",
    slp: "",
  },
  ldo: {
    token: "",
  },
  bond: {
    token: "",
    rewardStakingPool: "",
    yieldFarm: "",
  },
  eden: {
    token: "",
    rewardManager: "",
  },
  dpx: {
    token: "",
  },
  rdpx: {
    token: "",
  },
};

export interface Addresses {
  sushi: {
    router: string;
    token: string;
    chef: string;
    factory: string;
    xsushi: string;
    chef2: string;
    pools: {
      cvx_eth: string;
      eden_eth: string;
    };
  };
  uniswap: Uniswap;
  zero: string;
  assets: {
    [symbol: string]: string;
  };
  alchemix: {
    token: string;
    slp: string;
    pool: string;
  };
  cvx: {
    token: string;
    slp: string;
    pool: string;
    rewards: string;
  };
  ygg: {
    token: string;
    slp: string;
  };
  bit: {
    token: string;
    slp: string;
  };
  wsteth: {
    token: string;
    slp: string;
  };
  ldo: {
    token: string;
  };
  bond: {
    token: string;
    rewardStakingPool: string;
    yieldFarm: string;
  };
  eden: {
    token: string;
    rewardManager: string;
  };
  dpx: {
    token: string;
  };
  rdpx: {
    token: string;
  };
}
