import axios from "axios";

interface UniDay {
  dailyVolumeUSD: number;
  reserveUSD: number;
  reserve0: number;
  reserve1: number;
}

interface SushiDay {
  reserveUSD: number;
  volumeUSD: number;
  reserve0: number;
  reserve1: number;
  pair: {
    id: string;
  };
}

interface Day {
  reserveUSD: number;
  volumeUSD: number;
  reserve0: number;
  reserve1: number;
}

interface Price {
  priceUSD: number;
}

const uniEndpoint =
  "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2";
const sushiEndpoint =
  "https://api.thegraph.com/subgraphs/name/sushiswap/exchange";
const chefEndpoint =
  "https://api.thegraph.com/subgraphs/name/sushiswap/master-chef";
const sushi = "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2";
const start = Math.floor(Date.now() / 1000 - 91 * 24 * 60 * 60);

const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

function getYield(history: Day[]) {
  const avgDailyYield = Math.pow(
    history
      .map((day) => {
        const fees = day.volumeUSD * 0.003;
        return fees / (day.reserveUSD - fees);
      })
      .reduce((a, b) => a * b),
    1 / history.length
  );
  const apy = Math.pow(1 + avgDailyYield, 365) - 1;

  const firstPrice = history[0].reserve0 / history[0].reserve1;
  const lastPrice =
    history[history.length - 1].reserve0 / history[history.length - 1].reserve1;
  const ratio = firstPrice / lastPrice;
  const impermanentLoss = (2 * (Math.sqrt(ratio) / ratio + 1) - 1) / 100;

  const netYield = apy - impermanentLoss;

  return { apy: apy, iloss: impermanentLoss, net: netYield };
}

export async function uniswap(tokenA: string, tokenB: string) {
  const [token0, token1] =
    tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];
  const history: UniDay[] = (
    await axios.post(uniEndpoint, {
      query: `
        {
            pairDayDatas(first: 90, orderBy: date, orderDirection: asc, where: {
                token0: "${token0}",
                token1: "${token1}",
                date_gt: ${start}
            }) {
                dailyVolumeUSD
                reserveUSD
                reserve0
                reserve1
            }
        }
        `,
    })
  ).data.data.pairDayDatas;

  const { apy, iloss, net } = getYield(
    history.map((val) => {
      return {
        reserve0: val.reserve0,
        reserve1: val.reserve1,
        volumeUSD: val.dailyVolumeUSD,
        reserveUSD: val.reserveUSD,
      };
    })
  );

  console.log(`U POOL APY ${apy}`);
  console.log(`U IL -${iloss}`);
  console.log(`U NET POOL APY ${net}`);
}

export async function sushiswap(tokenA: string, tokenB: string) {
  const [token0, token1] =
    tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];
  const history: SushiDay[] = (
    await axios.post(sushiEndpoint, {
      query: `
      {
        pairDayDatas(first: 90, orderBy: date, orderDirection: asc, where: {
          token0: "${token0}",
          token1: "${token1}",
          date_gt: ${start}
        }) {
          pair { id }
          reserveUSD
          volumeUSD
          reserve0
          reserve1
        }
      }
    `,
    })
  ).data.data.pairDayDatas;

  const { apy, iloss, net } = getYield(
    history.map((val) => {
      return {
        reserve0: val.reserve0,
        reserve1: val.reserve1,
        volumeUSD: val.volumeUSD,
        reserveUSD: val.reserveUSD,
      };
    })
  );

  console.log(`S POOL APY ${apy}`);
  console.log(`S IL -${iloss}`);
  console.log(`S NET POOL APY ${net}`);

  const { sushiPerBlock, totalAllocPoint } = (
    await axios.post(chefEndpoint, {
      query: `
        {
          masterChefs(first: 1) {
            sushiPerBlock,
            totalAllocPoint
          }
        }
      `,
    })
  ).data.data.masterChefs[0];

  const poolAllocation = (
    await axios.post(chefEndpoint, {
      query: `
      {
        pools(first: 1, where: {
          pair: "${history[0].pair.id}"
        }) { allocPoint }
      }
    `,
    })
  ).data.data.pools[0].allocPoint;

  const sushiPrices: Price[] = (
    await axios.post(uniEndpoint, {
      query: `
      {
        tokenDayDatas(first: 90, where: {
          token: "${sushi}",
          date_gt: ${start}
        }) { priceUSD }
      }
    `,
    })
  ).data.data.tokenDayDatas;

  const rewardYield = Math.pow(
    sushiPrices
      .map((val, ind) => {
        const rewardUSD =
          (sushiPerBlock / 1e18) *
          6171 *
          (poolAllocation / totalAllocPoint) *
          val.priceUSD *
          (history[0].reserveUSD / history[ind].reserveUSD);
        return rewardUSD / history[0].reserveUSD;
      })
      .reduce((acc, val) => acc * val),
    1 / sushiPrices.length
  );

  const rewardApy = Math.pow(1 + rewardYield, 365) - 1;

  console.log(`S REWARD APY ${rewardApy}`);
  console.log(`S TOTAL APY ${rewardApy + net}`);
}

uniswap(usdc, weth);
sushiswap(usdc, weth);
