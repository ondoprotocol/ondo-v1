import asset from "assert";
import {
  IUniswapV2Router02,
  IUniswapV2Router02__factory,
  IUniswapV2Factory__factory,
  ERC20Mock,
  ERC20Mock__factory,
  IUniswapV2Pair__factory,
  IUniswapV2Pair,
  ERC20,
} from "../../../typechain";
import bn from "bignumber.js";
import _ from "lodash";
import { Signer, BigNumberish, BigNumber } from "ethers";
import { Provider } from "@ethersproject/providers";
import { pack, keccak256 } from "@ethersproject/solidity";
import { getCreate2Address } from "@ethersproject/address";
import { FACTORY_ADDRESS, INIT_CODE_HASH } from "@uniswap/sdk";
import Decimal from "decimal.js";
import { assert } from "ts-essentials";
import "../../../test/utils/bignumberhax";

export const uniRouterAddr = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
export const sushiRouterAddr = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";

let _uniRouter: IUniswapV2Router02;

const getUniRouter = (providerOrSigner: Provider | Signer) => {
  return (
    (_uniRouter && _uniRouter.connect(providerOrSigner)) ||
    (_uniRouter = IUniswapV2Router02__factory.connect(
      uniRouterAddr,
      providerOrSigner
    ))
  );
};

const getAmountOut = (amtIn: Decimal, rIn: Decimal, rOut: Decimal) => {
  const amtInWFee = amtIn.mul(997);
  const numerator = amtInWFee.mul(rOut);
  const denominator = rIn.mul(1000).add(amtInWFee);
  return numerator.div(denominator);
};

const getAmountIn = (amtOut: Decimal, rIn: Decimal, rOut: Decimal) => {
  assert(amtOut.lt(rOut), "Swapping exact out in too great excess");
  const numerator = rIn.mul(amtOut).mul(1000);
  const denominator = rOut.sub(amtOut).mul(997);
  return numerator.div(denominator).plus(1);
};

const calcExactMatchSr = (
  srExpected: Decimal,
  liquidity: Decimal,
  totalSupply: Decimal
) => {
  /**
   * What we want here is to figure out how many senior reserves should be in the liquidity pool
   * to force the scenario of having exactly the amount of sr reserves necessary such that
   * all of jr gets sold and the senior hurdle rate is precisely met.
   * (i.e. junior BTFO completely, but we still have enough to match the senior hurdle)
   *
   * The amount of tokens A (resp B) received from removing liquidity are
   * reserves * lpTokensToRedeem / totalSupplyOfLpTokens
   *
   * So want to solve for srReserves from swapExactOut(seniorExpected - seniorObtained) = juniorObtained
   * i.e. swapExactOut(seniorExpected - srReserves * lpTokens / totalSupply) = jrReserves * lpTokens / totalSupply
   *
   * For our purposes (i.e. not caring much about precision) the inverse of
   * swapExactOut is of course swapExactIn, ergo
   *
   * seniorExpected - srReserves * lpTokens / totalSupply = swapExactIn(jrReserves * lpTokens / totalSupply)
   *
   * We abbreviate in the following using sE, sR, l, t, jR
   *
   * We'll let f represent (1 - fee) i.e. 0.997
   *
   * Reminder:
   *           reservesOut * amtIn * f
   * amtOut =  -----------------------
   *           reservesIn + amtIn * f
   *
   * An important factor to note is that we swap *after having removed the reserves*, so our swap calculation
   * should use post-removal amounts for the reserves
   *
   * So reservesOut will be (sR - sR * l / t) and reservesIn will be (jR - jR * l / t)
   *
   *                    (sR - sR * l / t) * f * (jR * l / t)
   * sE - sR * l / t = --------------------------------------
   *                     (jR - jR * l / t) + f * (jR * l / t)
   *
   *
   * factor out sR, jR is a factor in every term in numerator and denominator,
   * so it cancels out
   *
   *         (1 - l / t) * f * l / t
   * = sR * ------------------------
   *         (1 - l / t) + f * l / t
   *
   * Bring over sR * l / t, go ahead and include it in the factoring we just did
   *
   *             /  (1 - l / t) * f * l / t         \
   * sE = sR *  | ------------------------- + l / t |
   *             \ (1 - l / t) + f * l / t          /
   *
   * Factor out l/t (i.e. multiply by (t/l)/(t/l)) and rearrange the denominator
   *
   *          /  (t / l - 1) * f      \
   * = sR *  | ------------------ + 1 |
   *          \ t / l + f - 1         /
   *
   *  Distribute f, replace 1 with denominator/denominator
   *
   *          f * t / l - f  + t / l + f - 1
   * = sR *  --------------------------------
   *                 t / l + f - 1
   *
   * Simplify: f - f = 0, factor t/l out of f*t/l + t/l
   *
   *         (t / l) * (f + 1) - 1
   * = sR * -----------------------
   *            t / l + f - 1
   *
   * Finally,
   *
   *         sE * (t / l + f - 1)
   * sR =   ---------------------
   *        (t / l) * (f + 1) - 1
   *
   */

  const fee = new Decimal(0.997);

  const inverseShare = totalSupply.div(liquidity);

  const numerator = srExpected.times(inverseShare.plus(fee).minus(1));
  const denominator = inverseShare.times(fee.plus(1)).minus(1);

  return numerator.div(denominator);
};

const mintFee = (
  r0: Decimal,
  r1: Decimal,
  totalSupply: Decimal,
  kLast?: Decimal
) => {
  if (!!kLast) {
    const rootK = r0.mul(r1).sqrt();
    const rootKLast = kLast.sqrt();
    if (rootK.sub(rootKLast).abs().gt(100)) {
      const numerator = totalSupply.mul(rootK.sub(kLast));
      const denominator = rootK.mul(5).div(rootKLast);
      totalSupply = totalSupply.add(numerator.div(denominator));
    }
  }
  return totalSupply;
};

const calcLiqValue = (
  r0: Decimal,
  r1: Decimal,
  totalSupply: Decimal,
  amt: Decimal,
  kLast?: Decimal
): [Decimal, Decimal] => {
  totalSupply = mintFee(r0, r1, totalSupply, kLast);
  return [r0.mul(amt).div(totalSupply), r1.mul(amt).div(totalSupply)];
};

const quote = (amtA: Decimal, rA: Decimal, rB: Decimal) => amtA.mul(rB).div(rA);

const calcMintValue = (
  amt0: Decimal,
  amt1: Decimal,
  r0: Decimal,
  r1: Decimal,
  totalSupply: Decimal,
  kLast?: Decimal
): [Decimal, Decimal, Decimal] => {
  totalSupply = mintFee(r0, r1, totalSupply, kLast);
  let amt0Excess = new Decimal(0);
  let amt1Excess = new Decimal(0);
  if (totalSupply.eq(0)) {
    return [amt0.mul(amt1).sqrt().sub(1000), amt0Excess, amt1Excess];
  }
  const amt1Optimal = quote(amt0, r0, r1);
  const amt0Optimal = quote(amt1, r1, r0);
  if (amt1Optimal.lte(amt1)) {
    amt1 = amt1Optimal;
    amt1Excess = amt1.sub(amt1Optimal);
  } else if (amt0Optimal.lte(amt0)) {
    amt0 = amt0Optimal;
    amt0Excess = amt0.sub(amt0Optimal);
  }
  return [
    Decimal.min(amt0.mul(totalSupply).div(r0), amt1.mul(totalSupply).div(r1)),
    amt0Excess,
    amt1Excess,
  ];
};

const get_pair = (factory: string, tokenA: string, tokenB: string) => {
  let token0: string;
  let token1: string;
  if (tokenA.toLowerCase() < tokenB.toLowerCase()) {
    token0 = tokenA;
    token1 = tokenB;
  } else {
    token0 = tokenB;
    token1 = tokenA;
  }
  return getCreate2Address(
    factory,
    keccak256(["bytes"], [pack(["address", "address"], [token0, token1])]),
    get_code_hash(factory)
  );
};

const get_code_hash = (factory: string) => {
  if (process.env.BLOCKCHAIN == "polygon") {
    // quickswap_code_hash
    return "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
  } else if (process.env.BLOCKCHAIN == "bsc") {
    // pancake_code_hash
    return "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";
  } else {
    return FACTORY_ADDRESS.toLowerCase() == factory.toLowerCase()
      ? INIT_CODE_HASH
      : // sushi_code_hash
        "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";
  }
};

const deadline = () => Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60;

class UniPool {
  /**
   * Constructs a UniPool instance which abstracts over Uniswap pool operations
   * @param {ERC20} token0
   * @param {ERC20} token1
   * @param {Provider} provider
   */
  protected constructor(
    public readonly token0: ERC20,
    public readonly token1: ERC20,
    public readonly provider: Provider,
    public readonly pool: IUniswapV2Pair,
    public readonly router: IUniswapV2Router02,
    public readonly feeOn: boolean
  ) {}

  static async create(
    tokenA: ERC20,
    tokenB: ERC20,
    uniRouter: string,
    provider: Provider
  ) {
    let token0: ERC20;
    let token1: ERC20;
    if (tokenA.address.toLowerCase() < tokenB.address.toLowerCase()) {
      token0 = tokenA.connect(provider);
      token1 = tokenB.connect(provider);
    } else {
      token0 = tokenB.connect(provider);
      token1 = tokenA.connect(provider);
    }
    const router = IUniswapV2Router02__factory.connect(uniRouter, provider);

    const factory = IUniswapV2Factory__factory.connect(
      await router.factory(),
      provider
    );
    const pool = IUniswapV2Pair__factory.connect(
      get_pair(factory.address, token0.address, token1.address),
      provider
    );
    const feeOn = await factory.feeTo().then((x) => BigNumber.from(x).gt(0));
    return new UniPool(token0, token1, provider, pool, router, feeOn);
  }

  /**
   * Swaps an exact amount of tokens via uniswap router
   * @param {"zero" | "one"} token
   * @param {BigNumberish} amount
   * @param {Signer} signer
   */
  async swapExactIn(
    token: "zero" | "one",
    amount: BigNumberish,
    signer: Signer
  ) {
    let _tokenIn: ERC20;
    let _tokenOut: ERC20;
    if (token == "zero") {
      _tokenIn = this.token0;
      _tokenOut = this.token1;
    } else if (token == "one") {
      _tokenIn = this.token1;
      _tokenOut = this.token0;
    } else {
      throw new Error(
        'UniPool.prototype.swapExactIn: token should be "zero" or "one"'
      );
    }
    const signerAddress = await signer.getAddress();
    const balBefore = await _tokenOut.balanceOf(signerAddress);
    await _tokenIn.connect(signer).approve(this.router.address, amount);
    await this.router
      .connect(signer)
      .swapExactTokensForTokens(
        amount,
        0,
        [_tokenIn.address, _tokenOut.address],
        signerAddress,
        deadline()
      );
    return _tokenOut
      .balanceOf(signerAddress)
      .then((bal: BigNumber) => bal.sub(balBefore));
  }
  /**
   * Adds liquidity to pool via uniswap router
   * @param {BigNumberish} amount0
   * @param {BigNumberish} amount1
   * @param {Signer} signer
   */
  async addLiquidity(
    amount0: BigNumberish,
    amount1: BigNumberish,
    signer: Signer
  ) {
    const _token0 = this.token0.connect(signer);
    const _token1 = this.token1.connect(signer);
    const signerAddress = await signer.getAddress();
    const liqBefore = await this.pool.balanceOf(signerAddress);
    await _token0.approve(this.router.address, amount0);
    await _token1.approve(this.router.address, amount1);

    await this.router.addLiquidity(
      _token0.address,
      _token1.address,
      amount0,
      amount1,
      0,
      0,
      signerAddress,
      deadline(),
      { gasLimit: 500000 }
    );
    return this.pool.balanceOf(signerAddress).then((liq) => liq.sub(liqBefore));
  }

  /**
   * Removes liquidity to pool via uniswap router
   * @param {BigNumberish} amount0
   * @param {BigNumberish} amount1
   * @param {Signer} signer
   */
  async removeLiquidity(
    amount: BigNumberish,
    signer: Signer
  ): Promise<[BigNumber, BigNumber]> {
    const signerAddress = await signer.getAddress();
    await this.pool.connect(signer).approve(this.router.address, amount);
    const balOld = await this.balancesOf(signer);
    await this.router.removeLiquidity(
      this.token0.address,
      this.token1.address,
      amount,
      1,
      1,
      signerAddress,
      deadline(),
      { gasLimit: 500000 }
    );
    const balNew = await this.balancesOf(signer);
    return <any>_.zip(balOld, balNew).map(([bold, bnew]) => bnew!.sub(bold!));
  }

  /**
   * Adds liquidity to a pool from a single token by firstly swapping the proportional amount to the other side
   * @param {"zero" | "one"} token
   * @param {BigNumberish} amount
   * @param {Signer} signer
   */
  async addSingleIn(
    token: "zero" | "one",
    amount: BigNumberish,
    signer: Signer
  ) {
    const _amt = BigNumber.from(amount);
    let reserveIn: BigNumber;
    let _tokenIn: ERC20;
    let _tokenOut: ERC20;
    if (token == "zero") {
      _tokenIn = this.token0.connect(signer);
      _tokenOut = this.token1.connect(signer);
      [reserveIn] = await this.pool.getReserves();
    } else if (token == "one") {
      _tokenIn = this.token1.connect(signer);
      _tokenOut = this.token0.connect(signer);
      [, reserveIn] = await this.pool.getReserves();
    } else {
      throw new Error(
        'UniPool.prototype.addOneLiquidity: token should be "zero" or "one"'
      );
    }
    const signerAddress = await signer.getAddress();
    const amtIn = reserveIn
      .mul(_amt.mul(3988000).add(reserveIn.mul(3988009)))
      .sub(reserveIn.mul(1997))
      .div(1994);
    await _tokenIn.approve(this.router.address, _amt);
    const outBalBefore = await _tokenOut.balanceOf(signerAddress);
    await this.router.swapExactTokensForTokens(
      amtIn,
      0,
      [_tokenIn.address, _tokenOut.address],
      signerAddress,
      deadline()
    );
    const _out = await _tokenOut
      .balanceOf(signerAddress)
      .then((bal) => outBalBefore.sub(bal));
    const _in = _amt.sub(amtIn);
    const liqBefore = await this.pool.balanceOf(signerAddress);
    await _tokenOut.approve(this.router.address, _out);
    await this.router.addLiquidity(
      _tokenIn.address,
      _tokenOut.address,
      _in,
      _out,
      0,
      0,
      signerAddress,
      deadline()
    );
    return this.pool.balanceOf(signerAddress).then((liq) => liq.sub(liqBefore));
  }

  async getAmountIn(token: 0 | 1, amtOut: Decimal) {
    let r0: Decimal;
    let r1: Decimal;
    const [rA, rB] = await this.pool.getReserves();
    if (token == 0) {
      r0 = new Decimal(rA.toString());
      r1 = new Decimal(rB.toString());
    } else {
      r0 = new Decimal(rB.toString());
      r1 = new Decimal(rA.toString());
    }
    return getAmountIn(amtOut, r1, r0);
  }

  async getAmountOut(token: 0 | 1, amtIn: Decimal) {
    let r0: Decimal;
    let r1: Decimal;
    const [rA, rB] = await this.pool.getReserves();
    if (token == 0) {
      r0 = new Decimal(rA.toString());
      r1 = new Decimal(rB.toString());
    } else {
      r0 = new Decimal(rB.toString());
      r1 = new Decimal(rA.toString());
    }
    return getAmountOut(amtIn, r0, r1);
  }

  async getLiqudityValue(amt: Decimal) {
    const [r0, r1] = await this.pool
      .getReserves()
      .then((all) => all.map((x) => new Decimal(x.toString())));

    return calcLiqValue(
      r0,
      r1,
      await this.pool.totalSupply().toD(),
      amt,
      this.feeOn ? await this.pool.kLast().toD() : undefined
    );
  }

  async calcMintValue(amt0: Decimal, amt1: Decimal) {
    const [r0, r1] = await this.pool
      .getReserves()
      .then((all) => all.map((x) => new Decimal(x.toString())));
    return calcMintValue(
      amt0,
      amt1,
      r0,
      r1,
      await this.pool.totalSupply().toD(),
      this.feeOn ? await this.pool.kLast().toD() : undefined
    );
  }

  async balancesOf(address: Signer | string) {
    const _addr =
      typeof address == "string" ? address : await address.getAddress();
    return Promise.all([
      this.token0.balanceOf(_addr),
      this.token1.balanceOf(_addr),
    ]);
  }
}

class UniPoolMock extends UniPool {
  private constructor(
    public readonly token0: ERC20Mock,
    public readonly token1: ERC20Mock,
    public readonly provider: Provider,
    public readonly pool: IUniswapV2Pair,
    public readonly router: IUniswapV2Router02,
    public readonly minter: Signer,
    public readonly minterAddress: string,
    public readonly feeOn: boolean
  ) {
    super(token0, token1, minter.provider!, pool, router, feeOn);
  }
  /**
   * Creates an instance of UniPoolMock, by creating two ERC20Mock tokens with `minter` as minter,
   * then creates the pair and if the two initReserve values are nonzero, adds liquidity to the pool
   * @param minter
   * @param initReserve0
   * @param initReserve1
   */
  static async createMock(
    minter: Signer,
    uniRouter: string,
    initReserve0: BigNumberish = 0,
    initReserve1: BigNumberish = 0
  ) {
    const tokenFactory = new ERC20Mock__factory(minter);
    const tokenA = await tokenFactory.deploy({ gasLimit: 9000000 });
    const tokenB = await tokenFactory.deploy({ gasLimit: 9000000 });
    let token0: ERC20Mock;
    let token1: ERC20Mock;
    if (tokenA.address.toLowerCase() < tokenB.address.toLowerCase()) {
      token0 = tokenA;
      token1 = tokenB;
    } else {
      token0 = tokenB;
      token1 = tokenA;
    }
    const provider = minter.provider!;
    const router = IUniswapV2Router02__factory.connect(uniRouter, minter);

    const factory = await IUniswapV2Factory__factory.connect(
      await router.factory(),
      minter
    );
    const _pool = IUniswapV2Pair__factory.connect(
      get_pair(factory.address, token0.address, token1.address),
      minter
    );
    const feeOn = await factory.feeTo().then((x) => BigNumber.from(x).gt(0));
    const pool = new UniPoolMock(
      token0,
      token1,
      provider,
      _pool,
      router,
      minter,
      await minter.getAddress(),
      feeOn
    );
    const _r0 = BigNumber.from(initReserve0);
    if (_r0.gt(0)) {
      const _r1 = BigNumber.from(initReserve1);
      if (_r0.gt(0)) {
        await pool.mintAndAdd(_r0, _r1);
      } else {
        throw new Error(
          "UniPool.createMock: initReserve must both be zero or nonzero"
        );
      }
    } else {
      await factory.createPair(token0.address, token1.address, {
        gasLimit: 9000000,
      });
    }
    return pool;
  }

  /**
   * Creates an instance of UniPoolMock, by creating two ERC20Mock tokens with `minter` as minter,
   * then creates the pair and if the two initReserve values are nonzero, adds liquidity to the pool
   * @param minter
   * @param initReserve0
   * @param initReserve1
   */
  static async connectMock(
    minter: Signer,
    uniRouter: string,
    tokenA: ERC20Mock,
    tokenB: ERC20Mock,
    initReserve0: BigNumberish = 0,
    initReserve1: BigNumberish = 0
  ) {
    let token0: ERC20Mock;
    let token1: ERC20Mock;
    if (tokenA.address.toLowerCase() < tokenB.address.toLowerCase()) {
      token0 = tokenA;
      token1 = tokenB;
    } else {
      token0 = tokenB;
      token1 = tokenA;
    }
    const provider = minter.provider!;
    const router = IUniswapV2Router02__factory.connect(uniRouter, minter);
    const factory = IUniswapV2Factory__factory.connect(
      await router.factory(),
      provider
    );
    const _pool = IUniswapV2Pair__factory.connect(
      get_pair(factory.address, token0.address, token1.address),
      minter
    );
    const feeOn = await factory.feeTo().then((x) => BigNumber.from(x).gt(0));

    const pool = new UniPoolMock(
      token0,
      token1,
      provider,
      _pool,
      router,
      minter,
      await minter.getAddress(),
      feeOn
    );
    const _r0 = BigNumber.from(initReserve0);
    if (_r0.gt(0)) {
      const _r1 = BigNumber.from(initReserve1);
      if (_r0.gt(0)) {
        await pool.mintAndAdd(_r0, _r1);
      } else {
        throw new Error(
          "UniPool.createMock: initReserve must both be zero or nonzero"
        );
      }
    } else {
      await IUniswapV2Factory__factory.connect(
        factory.address,
        minter
      ).createPair(token0.address, token1.address);
    }
    return pool;
  }

  /**
   * Mints one or the other token to the "to" ethereum address
   * @param {"zero" | "one'} token
   * @param {BigNumberish} amount
   * @param {address} to
   */
  async mint(token: "zero" | "one", amount: BigNumberish, to: string) {
    let _token: ERC20Mock;
    if (token == "zero") {
      _token = this.token0;
    } else if (token == "one") {
      _token = this.token1;
    } else {
      throw new Error(
        'UniPool.prototype.mint: token should be "zero" or "one"'
      );
    }
    await _token.mint(to, amount);
  }

  /**
   * This mints token
   * @param {"zero" | "one"} token
   * @param {BigNumberish} amount
   * @param {address} to
   */
  async mintAndSwapExactIn(
    token: "zero" | "one",
    amount: BigNumberish,
    to: Signer | string = this.minter
  ) {
    let _to = typeof to === "string" ? to : await to.getAddress();
    let _tokenIn: ERC20Mock;
    let _tokenOut: ERC20Mock;
    if (token == "zero") {
      _tokenIn = this.token0;
      _tokenOut = this.token1;
    } else if (token == "one") {
      _tokenIn = this.token1;
      _tokenOut = this.token0;
    } else {
      throw new Error(
        'UniPool.prototype.swapExactIn: token should be "zero" or "one"'
      );
    }
    const balBefore = await _tokenOut.balanceOf(_to);
    await _tokenIn.mint(this.minterAddress, _to);
    await _tokenIn.approve(this.router.address, amount);
    await this.router.swapExactTokensForTokens(
      amount,
      0,
      [_tokenIn.address, _tokenOut.address],
      _to,
      deadline()
    );
    return _tokenOut.balanceOf(_to).then((bal) => bal.sub(balBefore));
  }

  /**
   * Adds liquidity to a pool from a single token by firstly minting and
   * then swapping the proportional amount to the other side.
   * @param token
   * @param amt
   * @param to
   * @returns {BigNumber} LP Tokens received
   */
  async mintAndAddSingleIn(
    token: "zero" | "one",
    amt: BigNumberish,
    to: string | Signer = this.minterAddress
  ) {
    let _to = typeof to === "string" ? to : await to.getAddress();
    const _amt = BigNumber.from(amt);
    let reserveIn: BigNumber;
    let _tokenIn: ERC20Mock;
    let _tokenOut: ERC20Mock;
    if (token == "zero") {
      _tokenIn = this.token0;
      _tokenOut = this.token1;
      [reserveIn] = await this.pool.getReserves();
    } else if (token == "one") {
      _tokenIn = this.token1;
      _tokenOut = this.token0;
      [, reserveIn] = await this.pool.getReserves();
    } else {
      throw new Error(
        'UniPool.prototype.addOneLiquidity: token should be "zero" or "one"'
      );
    }
    const amtIn = reserveIn
      .mul(_amt.mul(3988000).add(reserveIn.mul(3988009)))
      .sub(reserveIn.mul(1997))
      .div(1994);
    await _tokenIn.mint(this.minterAddress, amtIn);
    await _tokenIn.approve(this.router.address, amt);
    const outBalBefore = await _tokenOut.balanceOf(this.minterAddress);
    await this.router.swapExactTokensForTokens(
      amtIn,
      0,
      [_tokenIn.address, _tokenOut.address],
      this.minterAddress,
      deadline()
    );
    const _out = await _tokenOut
      .balanceOf(this.minterAddress)
      .then((bal) => outBalBefore.sub(bal));
    const _in = _amt.sub(amtIn);
    const liqBefore = await this.pool.balanceOf(_to);
    await _tokenOut.approve(this.router.address, _out);
    await this.router.addLiquidity(
      _tokenIn.address,
      _tokenOut.address,
      _in,
      _out,
      0,
      0,
      _to,
      deadline()
    );
    return this.pool.balanceOf(_to).then((liq) => liq.sub(liqBefore));
  }

  /**
   * Mints tokens and adds them as liquidity to the pool. `to` receives the LP tokens
   * @param {BigNumberish} amt0
   * @param {BigNumberish} amt1
   * @param {string | Signer} to
   * @returns {BigNumber} LP Tokens received
   */
  async mintAndAdd(
    amt0: BigNumberish,
    amt1: BigNumberish,
    to: string | Signer = this.minterAddress
  ) {
    let _to = typeof to === "string" ? to : await to.getAddress();
    await this.token0.mint(this.minterAddress, amt0);
    await this.token1.mint(this.minterAddress, amt1);
    await this.token0.approve(this.router.address, amt0);
    await this.token1.approve(this.router.address, amt1);
    const liqBefore = await this.pool
      .balanceOf(_to)
      .catch((x) => BigNumber.from(0));
    await this.router.addLiquidity(
      this.token0.address,
      this.token1.address,
      amt0,
      amt1,
      0,
      0,
      _to,
      deadline()
    );
    return this.pool.balanceOf(_to).then((liq) => liq.sub(liqBefore));
  }

  /**
   * add reserves to simulate fees, proportional to the geometric average of reserves
   * @param {BigNumberish} fees % fees to add, represented as a fraction of 10000
   */
  async addFees(fees: BigNumberish) {
    const precision = new bn(10000);
    const _fees = new bn(fees.toString());
    const [_r0, _r1]: bn[] = await this.pool
      .getReserves()
      .then((r) => r.map((r) => new bn(r.toString())));

    const multiplier = precision.plus(_fees).div(precision);
    const k = _r0.times(_r1);
    const newk = k.times(multiplier);
    const new_r0 = newk.div(_r1);
    const new_r1 = newk.div(_r0);
    const amt0 = new_r0.minus(_r0).toFixed(0);
    const amt1 = new_r1.minus(_r1).toFixed(0);
    await this.addReserves(amt0, amt1);
  }

  /**
   * Adds reserves to the pool and then calls sync()
   * This simulates the increase of the constant product of reserves
   * relative to LP tokens via fee accruals. The spot price will change
   * if the proportions are different.
   * @param {BigNumberish} amt0
   * @param {BigNumberish} amt1
   */
  async addReserves(amt0: BigNumberish, amt1: BigNumberish) {
    await this.token0.mint(this.pool.address, amt0, { gasLimit: 500000 });
    await this.token1.mint(this.pool.address, amt1, { gasLimit: 500000 });
    await this.pool.sync({ gasLimit: 500000 });
  }

  /**
   * Removes reserves to the pool and then calls sync()
   * This doesn't really simulate any real world circumstances, but may be useful for testing
   * @param {BigNumberish} amt0
   * @param {BigNumberish} amt1
   */
  async removeReserves(amt0: BigNumberish, amt1: BigNumberish) {
    await this.token0.burn(this.pool.address, amt0, { gasLimit: 500000 });
    await this.token1.burn(this.pool.address, amt1, { gasLimit: 500000 });
    await this.pool.sync({ gasLimit: 500000 });
  }

  async swapExactIn(
    token: "zero" | "one",
    amount: BigNumberish,
    signer: Signer = this.minter
  ) {
    return super.swapExactIn(token, amount, signer);
  }

  async addLiquidity(
    amount0: BigNumberish,
    amount1: BigNumberish,
    signer: Signer = this.minter
  ) {
    return super.addLiquidity(amount0, amount1, signer);
  }

  async addSingleIn(
    token: "zero" | "one",
    amount: BigNumberish,
    signer: Signer = this.minter
  ) {
    return super.addSingleIn(token, amount, signer);
  }

  async removeLiquidity(amount: BigNumberish, signer: Signer = this.minter) {
    return super.removeLiquidity(amount, signer);
  }
}

export { UniPool, UniPoolMock, calcExactMatchSr };
