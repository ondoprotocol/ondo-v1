// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/lib/contracts/libraries/Babylonian.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "contracts/Registry.sol";
import "contracts/strategies/BasePairLPStrategy.sol";
import "contracts/vendor/uniswap/SushiSwapLibrary.sol";
import "contracts/vendor/sushiswap/IMasterChef.sol";
import "contracts/libraries/OndoLibrary.sol";
import "contracts/vendor/abdk/ABDKMathQuad.sol";
import "contracts/vendor/sushiswap/ISushiBar.sol";

/**
 * @title Access Sushiswap
 * @notice Add and remove liquidity to Sushiswap
 * @dev Though Sushiswap ripped off Uniswap, there is an extra step of
 *      dealing with mining incentives. Unfortunately some of this info is
 *      not in the Sushiswap contracts. This strategy will occasionally sell
 *      Sushi for more senior/junior assets to reinvest as more LP. This cycle
 *      continues: original assets -> LP -> sushi -> LP.
 */
contract SushiStrategyLP is BasePairLPStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  string public constant name = "Ondo SushiSwap LP Strategy";

  struct PoolData {
    address[] pathFromSushi;
    uint256 pid;
    uint256 totalShares;
    uint256 totalLp;
    uint256 pendingXSushi;
    bool _isSet; // can't use pid because pid 0 is usdt/eth
  }

  mapping(address => PoolData) public pools;
  mapping(address => uint256) public lastHarvestBlock;

  // Pointers to Sushiswap contracts
  IUniswapV2Router02 public immutable sushiRouter;
  IERC20 public immutable sushiToken;
  IMasterChef public immutable masterChef;
  address public immutable sushiFactory;
  ISushiBar public immutable xSushi;

  event NewPair(address indexed pool, uint256 pid);

  /**
   * @dev
   * @param _registry Ondo global registry
   * @param _router Address for UniswapV2Router02 for Sushiswap
   * @param _chef Sushiswap contract that handles mining incentives
   * @param _factory Address for UniswapV2Factory for Sushiswap
   * @param _sushi ERC20 contract for Sushi tokens
   * @param _xSushi ERC20 contract for xSushi tokens
   */
  constructor(
    address _registry,
    address _router,
    address _chef,
    address _factory,
    address _sushi,
    address _xSushi
  ) BasePairLPStrategy(_registry) {
    require(_router != address(0), "Invalid address");
    require(_chef != address(0), "Invalid address");
    require(_factory != address(0), "Invalid address");
    require(_sushi != address(0), "Invalid address");
    require(_xSushi != address(0), "Invalid address");
    registry = Registry(_registry);
    sushiRouter = IUniswapV2Router02(_router);
    sushiToken = IERC20(_sushi);
    masterChef = IMasterChef(_chef);
    sushiFactory = _factory;
    xSushi = ISushiBar(_xSushi);
  }

  /**
   * @notice Conversion of LP tokens to shares
   * @param vaultId Vault
   * @param lpTokens Amount of LP tokens
   * @return Number of shares for LP tokens
   * @return Total shares for this Vault
   * @return Sushiswap pool
   */
  function sharesFromLp(uint256 vaultId, uint256 lpTokens)
    public
    view
    override
    returns (
      uint256,
      uint256,
      IERC20
    )
  {
    Vault storage vault_ = vaults[vaultId];
    PoolData storage poolData = pools[address(vault_.pool)];
    return (
      (lpTokens * poolData.totalShares) / poolData.totalLp,
      vault_.shares,
      vault_.pool
    );
  }

  /**
   * @notice Conversion of shares to LP tokens
   * @param vaultId Vault
   * @param shares Amount of shares
   * @return Number LP tokens
   * @return Total shares for this Vault
   */
  function lpFromShares(uint256 vaultId, uint256 shares)
    public
    view
    override
    returns (uint256, uint256)
  {
    Vault storage vault_ = vaults[vaultId];
    PoolData storage poolData = pools[address(vault_.pool)];
    return ((shares * poolData.totalLp) / poolData.totalShares, vault_.shares);
  }

  /**
   * @notice Add LP tokens while Vault is live
   * @dev Maintain the amount of lp deposited directly
   * @param _vaultId Vault
   * @param _lpTokens Amount of LP tokens
   */
  function addLp(uint256 _vaultId, uint256 _lpTokens)
    external
    virtual
    override
    whenNotPaused
    onlyOrigin(_vaultId)
  {
    Vault storage vault_ = vaults[_vaultId];
    PoolData storage poolData = pools[address(vault_.pool)];
    (uint256 userShares, , ) = sharesFromLp(_vaultId, _lpTokens);
    vault_.shares += userShares;
    poolData.totalShares += userShares;
    poolData.totalLp += _lpTokens;
    midTermDepositLp(vault_.pool, _lpTokens);
  }

  /**
   * @notice Remove LP tokens while Vault is live
   * @dev
   * @param _vaultId Vault
   * @param _shares Number of shares
   * @param to Send LP tokens here
   */
  function removeLp(
    uint256 _vaultId,
    uint256 _shares,
    address to
  ) external override whenNotPaused onlyOrigin(_vaultId) {
    Vault storage vault_ = vaults[_vaultId];
    address pool = address(vault_.pool);
    require(
      block.number > lastHarvestBlock[pool],
      "Can't removeLp in same block as harvest call"
    );
    PoolData storage poolData = pools[address(vault_.pool)];
    (uint256 userLp, ) = lpFromShares(_vaultId, _shares);
    uint256 sushiAmt = sushiToken.balanceOf(address(this));
    masterChef.withdraw(poolData.pid, userLp);
    sushiAmt = sushiToken.balanceOf(address(this)) - sushiAmt;
    uint256 xSushiAmt = xSushi.balanceOf(address(this));
    sushiToken.ondoSafeIncreaseAllowance(address(xSushi), sushiAmt);
    xSushi.enter(sushiAmt);
    poolData.pendingXSushi += xSushi.balanceOf(address(this)) - xSushiAmt;
    vault_.shares -= _shares;
    poolData.totalShares -= _shares;
    poolData.totalLp -= userLp;
    IERC20(vault_.pool).safeTransfer(to, userLp);
  }

  function getSushiPath(address[] storage pathFromSushi)
    internal
    view
    returns (address[] memory path)
  {
    path = new address[](pathFromSushi.length + 1);
    path[0] = address(sushiToken);
    for (uint256 i = 0; i < pathFromSushi.length; i++) {
      path[i + 1] = pathFromSushi[i];
    }
  }

  // @dev harvest must be a controlled function b/c engages with uniswap
  // in mean time, can gain sushi rewards via xsushi on sushi gained
  // from depositing into masterchef mid term
  function midTermDepositLp(IERC20 pool, uint256 _lpTokens) internal {
    PoolData storage poolData = pools[address(pool)];
    uint256 sushiAmt = sushiToken.balanceOf(address(this));
    pool.ondoSafeIncreaseAllowance(address(masterChef), _lpTokens);
    masterChef.deposit(pools[address(pool)].pid, _lpTokens);
    sushiAmt = sushiToken.balanceOf(address(this)) - sushiAmt;
    uint256 xSushiAmt = xSushi.balanceOf(address(this));
    sushiToken.ondoSafeIncreaseAllowance(address(xSushi), sushiAmt);
    xSushi.enter(sushiAmt);
    poolData.pendingXSushi += xSushi.balanceOf(address(this)) - xSushiAmt;
  }

  //MasterChef.deposit() looks up the pool LP tokens are being deposited from in a storage array by index
  //The indices are only available in event logs, so this function could be called either by a bot or Vault.createVault
  /**
   * @notice Add info about pool
   * @dev
   * @param _pool Sushiswap pool
   * @param _pid Id of Pool from Sushiswap
   * @param pathFromSushi Conversion route for asset 0
   */
  function addPool(
    address _pool,
    uint256 _pid,
    address[] calldata pathFromSushi
  ) external whenNotPaused isAuthorized(OLib.STRATEGIST_ROLE) {
    require(!pools[_pool]._isSet, "Pool ID already registered");
    require(_pool != address(0), "Cannot be zero address");
    IMasterChef.PoolInfo memory poolInfo = masterChef.poolInfo(_pid);
    require(address(poolInfo.lpToken) == _pool, "Pool ID does not match pool");
    address token0 = IUniswapV2Pair(_pool).token0();
    address token1 = IUniswapV2Pair(_pool).token1();
    bool oneSushiToken =
      token0 == address(sushiToken) || token1 == address(sushiToken);
    require(
      (oneSushiToken && pathFromSushi.length == 0) || !oneSushiToken,
      "Pool either must have sushi token and zero length or no sushi token in pool"
    );
    if (pathFromSushi.length != 0) {
      address endToken = pathFromSushi[pathFromSushi.length - 1];
      require(
        token0 == endToken || token1 == endToken,
        "Not a valid path for pool"
      );
      pools[_pool].pathFromSushi = pathFromSushi;
    }

    pools[_pool].pid = _pid;
    pools[_pool]._isSet = true;

    emit NewPair(_pool, _pid);
  }

  /**
   * @notice If needed to update path from sushi
   * @param _pool Sushiswap pool
   * @param pathFromSushi Path from sushi to asset 0
   */
  function updatePool(address _pool, address[] calldata pathFromSushi)
    external
    nonReentrant
    whenNotPaused
    isAuthorized(OLib.STRATEGIST_ROLE)
  {
    require(pools[_pool]._isSet, "Pool ID not yet registered");
    address token0 = IUniswapV2Pair(_pool).token0();
    address token1 = IUniswapV2Pair(_pool).token1();
    require(
      token0 != address(sushiToken) && token1 != address(sushiToken),
      "Should never need to update pool with sushi token"
    );
    address endToken = pathFromSushi[pathFromSushi.length - 1];
    require(
      IUniswapV2Pair(_pool).token0() == endToken ||
        IUniswapV2Pair(_pool).token1() == endToken,
      "Not a valid path for pool"
    );
    PoolData storage poolData = pools[_pool];
    delete poolData.pathFromSushi;
    pools[_pool].pathFromSushi = pathFromSushi;
  }

  /**
   * @notice Reinvest sushi into LP tokens
   * @dev Tricky because MasterChef API is bad.
   * @param pool Sushiswap pool
   * @param poolData Info about current state of pool investments
   */
  function _compound(IERC20 pool, PoolData storage poolData)
    internal
    returns (uint256 lpAmt)
  {
    uint256 sushiAmt = sushiToken.balanceOf(address(this));
    masterChef.deposit(poolData.pid, 0); // Called to trigger update in amount of sushi truly available now
    xSushi.leave(poolData.pendingXSushi);
    poolData.pendingXSushi = 0;
    sushiAmt = sushiToken.balanceOf(address(this)) - sushiAmt;
    if (sushiAmt > 0) {
      address[] memory pathFromSushi = getSushiPath(poolData.pathFromSushi);
      address tokenA = pathFromSushi[pathFromSushi.length - 1];
      address tokenB = IUniswapV2Pair(address(pool)).token0();
      if (tokenB == tokenA) tokenB = IUniswapV2Pair(address(pool)).token1();
      uint256 amt0;
      if (tokenA == address(sushiToken)) {
        amt0 = sushiAmt;
      } else {
        amt0 = swapExactIn(sushiAmt, 0, pathFromSushi);
      }
      uint256 amt0ToSwap;
      (uint256 reserves0, ) =
        SushiSwapLibrary.getReserves(sushiFactory, tokenA, tokenB);
      amt0 -= (amt0ToSwap = calculateSwapInAmount(reserves0, amt0));
      uint256 amt1 = swapExactIn(amt0ToSwap, 0, getPath(tokenA, tokenB));
      (, , lpAmt) = addLiquidity(tokenA, tokenB, amt0, amt1, 0, 0);
      // TODO: do something with excess - will be extremely minimal though (<2)
      poolData.totalLp += lpAmt;
    }
    pool.ondoSafeIncreaseAllowance(
      address(masterChef),
      pool.balanceOf(address(this))
    );
    masterChef.deposit(poolData.pid, pool.balanceOf(address(this)));
  }

  function depositIntoChef(uint256 vaultId, uint256 _amount) internal {
    Vault storage vault = vaults[vaultId];
    IERC20 pool = vault.pool;
    PoolData storage poolData = pools[address(pool)];
    _compound(pool, poolData);
    if (poolData.totalLp == 0 || poolData.totalShares == 0) {
      poolData.totalShares = _amount;
      poolData.totalLp = _amount;
      vault.shares = _amount;
    } else {
      uint256 shares = (_amount * poolData.totalShares) / poolData.totalLp;
      poolData.totalShares += shares;
      vault.shares = shares;
      poolData.totalLp += _amount;
    }
  }

  function withdrawFromChef(uint256 vaultId)
    internal
    returns (uint256 lpTokens)
  {
    Vault storage vault = vaults[vaultId];
    IERC20 pool = vault.pool;
    PoolData storage poolData = pools[address(pool)];
    _compound(pool, poolData);
    lpTokens = vault.shares == poolData.totalShares
      ? poolData.totalLp
      : (poolData.totalLp * vault.shares) / poolData.totalShares;
    poolData.totalLp -= lpTokens;
    poolData.totalShares -= vault.shares;
    vault.shares = 0;
    masterChef.withdraw(poolData.pid, lpTokens);
    return lpTokens;
  }

  /**
   * @notice Periodically reinvest sushi/xsushi into LP tokens
   * @param pool Sushiswap pool to reinvest
   */
  function harvest(address pool, uint256 minLp)
    external
    isAuthorized(OLib.STRATEGIST_ROLE)
    returns (uint256)
  {
    lastHarvestBlock[pool] = block.number;
    PoolData storage poolData = pools[pool];
    uint256 lp = _compound(IERC20(pool), poolData);
    require(lp >= minLp, "Exceeds maximum slippage");
    emit Harvest(pool, lp);
    return lp;
  }

  function poolExists(IERC20 srAsset, IERC20 jrAsset)
    internal
    view
    returns (bool)
  {
    return
      IUniswapV2Factory(sushiFactory).getPair(
        address(srAsset),
        address(jrAsset)
      ) != address(0);
  }

  /**
   * @notice Register a Vault with the strategy
   * @param _vaultId Vault
   * @param _senior Asset for senior tranche
   * @param _junior Asset for junior tranche
   */
  function addVault(
    uint256 _vaultId,
    IERC20 _senior,
    IERC20 _junior
  ) external override whenNotPaused nonReentrant isAuthorized(OLib.VAULT_ROLE) {
    require(
      address(vaults[_vaultId].origin) == address(0),
      "Vault id already registered"
    );
    require(poolExists(_senior, _junior), "Pool doesn't exist");
    address pair =
      SushiSwapLibrary.pairFor(
        sushiFactory,
        address(_senior),
        address(_junior)
      );
    require(pools[pair]._isSet, "No MasterChef farming for this pool");
    vaults[_vaultId].origin = IPairVault(msg.sender);
    vaults[_vaultId].pool = IERC20(pair);
    vaults[_vaultId].senior = _senior;
    vaults[_vaultId].junior = _junior;
  }

  /**
   * @dev Simple wrapper around uniswap
   * @param amtIn Amount in
   * @param minOut Minimumum out
   * @param path Router path
   */
  function swapExactIn(
    uint256 amtIn,
    uint256 minOut,
    address[] memory path
  ) internal returns (uint256) {
    IERC20(path[0]).ondoSafeIncreaseAllowance(address(sushiRouter), amtIn);
    return
      sushiRouter.swapExactTokensForTokens(
        amtIn,
        minOut,
        path,
        address(this),
        block.timestamp
      )[path.length - 1];
  }

  function swapExactOut(
    uint256 amtOut,
    uint256 maxIn,
    address[] memory path
  ) internal returns (uint256) {
    IERC20(path[0]).ondoSafeIncreaseAllowance(address(sushiRouter), maxIn);
    return
      sushiRouter.swapTokensForExactTokens(
        amtOut,
        maxIn,
        path,
        address(this),
        block.timestamp
      )[0];
  }

  function addLiquidity(
    address token0,
    address token1,
    uint256 amt0,
    uint256 amt1,
    uint256 minOut0,
    uint256 minOut1
  )
    internal
    returns (
      uint256 out0,
      uint256 out1,
      uint256 lp
    )
  {
    IERC20(token0).ondoSafeIncreaseAllowance(address(sushiRouter), amt0);
    IERC20(token1).ondoSafeIncreaseAllowance(address(sushiRouter), amt1);
    (out0, out1, lp) = sushiRouter.addLiquidity(
      token0,
      token1,
      amt0,
      amt1,
      minOut0,
      minOut1,
      address(this),
      block.timestamp
    );
  }

  /**
   * @dev Given the total available amounts of senior and junior asset
   *      tokens, invest as much as possible and record any excess uninvested
   *      assets.
   * @param _vaultId Reference to specific Vault
   * @param _totalSenior Total amount available to invest into senior assets
   * @param _totalJunior Total amount available to invest into junior assets
   * @param _extraSenior Extra funds due to cap on tranche, must be returned
   * @param _extraJunior Extra funds due to cap on tranche, must be returned
   * @param _seniorMinIn Min amount expected for asset
   * @param _seniorMinIn Min amount expected for asset
   * @return seniorInvested Actual amout invested into LP tokens
   * @return juniorInvested Actual amout invested into LP tokens
   */
  function invest(
    uint256 _vaultId,
    uint256 _totalSenior,
    uint256 _totalJunior,
    uint256 _extraSenior,
    uint256 _extraJunior,
    uint256 _seniorMinIn,
    uint256 _juniorMinIn
  )
    external
    override
    nonReentrant
    whenNotPaused
    onlyOrigin(_vaultId)
    returns (uint256 seniorInvested, uint256 juniorInvested)
  {
    uint256 lpTokens;
    Vault storage vault_ = vaults[_vaultId];
    (seniorInvested, juniorInvested, lpTokens) = addLiquidity(
      address(vault_.senior),
      address(vault_.junior),
      _totalSenior,
      _totalJunior,
      _seniorMinIn,
      _juniorMinIn
    );
    vault_.seniorExcess = _totalSenior - seniorInvested + _extraSenior;
    vault_.juniorExcess = _totalJunior - juniorInvested + _extraJunior;
    depositIntoChef(_vaultId, lpTokens);
    emit Invest(_vaultId, lpTokens);
  }

  // hack to get stack down for redeem
  function getPath(address _token0, address _token1)
    internal
    pure
    returns (address[] memory path)
  {
    path = new address[](2);
    path[0] = _token0;
    path[1] = _token1;
  }

  function swapForSr(
    address _senior,
    address _junior,
    uint256 _seniorExpected,
    uint256 seniorReceived,
    uint256 juniorReceived
  ) internal returns (uint256, uint256) {
    uint256 seniorNeeded = _seniorExpected - seniorReceived;
    address[] memory jr2Sr = getPath(_junior, _senior);
    if (
      seniorNeeded >
      SushiSwapLibrary.getAmountsOut(sushiFactory, juniorReceived, jr2Sr)[1]
    ) {
      seniorReceived += swapExactIn(juniorReceived, 0, jr2Sr);
      return (seniorReceived, 0);
    } else {
      juniorReceived -= swapExactOut(seniorNeeded, juniorReceived, jr2Sr);
      return (_seniorExpected, juniorReceived);
    }
  }

  /**
   * @dev Convert all LP tokens back into the pair of underlying
   *      assets. Also convert any Sushi equally into both tranches.
   *      The senior tranche is expecting to get paid some hurdle
   *      rate above where they started. Here are the possible outcomes:
   * - If the senior tranche doesn't have enough, then sell some or
   *         all junior tokens to get the senior to the expected
   *         returns. In the worst case, the senior tranche could suffer
   *         a loss and the junior tranche will be wiped out.
   * - If the senior tranche has more than enough, reduce this tranche
   *    to the expected payoff. The excess senior tokens should be
   *    converted to junior tokens.
   * @param _vaultId Reference to a specific Vault
   * @param _seniorExpected Amount the senior tranche is expecting
   * @param _seniorMinReceived Compute the expected seniorReceived factoring in any slippage
   * @param _juniorMinReceived Same, for juniorReceived
   * @return seniorReceived Final amount for senior tranche
   * @return juniorReceived Final amount for junior tranche
   */
  function redeem(
    uint256 _vaultId,
    uint256 _seniorExpected,
    uint256 _seniorMinReceived,
    uint256 _juniorMinReceived
  )
    external
    override
    nonReentrant
    whenNotPaused
    onlyOrigin(_vaultId)
    returns (uint256 seniorReceived, uint256 juniorReceived)
  {
    Vault storage vault_ = vaults[_vaultId];
    {
      uint256 lpTokens = withdrawFromChef(_vaultId);
      vault_.pool.ondoSafeIncreaseAllowance(address(sushiRouter), lpTokens);
      (seniorReceived, juniorReceived) = sushiRouter.removeLiquidity(
        address(vault_.senior),
        address(vault_.junior),
        lpTokens,
        0,
        0,
        address(this),
        block.timestamp
      );
    }
    if (seniorReceived < _seniorExpected) {
      (seniorReceived, juniorReceived) = swapForSr(
        address(vault_.senior),
        address(vault_.junior),
        _seniorExpected,
        seniorReceived,
        juniorReceived
      );
    } else {
      if (seniorReceived > _seniorExpected) {
        juniorReceived += swapExactIn(
          seniorReceived - _seniorExpected,
          0,
          getPath(address(vault_.senior), address(vault_.junior))
        );
      }
      seniorReceived = _seniorExpected;
    }
    require(
      _seniorMinReceived <= seniorReceived &&
        _juniorMinReceived <= juniorReceived,
      "SushiStrategyLP: slippage"
    );
    vault_.senior.ondoSafeIncreaseAllowance(
      msg.sender,
      seniorReceived + vault_.seniorExcess
    );
    vault_.junior.ondoSafeIncreaseAllowance(
      msg.sender,
      juniorReceived + vault_.juniorExcess
    );
    emit Redeem(_vaultId);
    return (seniorReceived, juniorReceived);
  }

  /**
   * @notice Exactly how much of userIn to swap to get perfectly balanced ratio for LP tokens
   * @dev This code matches Alpha Homora and Zapper
   * @param reserveIn Amount of reserves for asset 0
   * @param userIn Availabe amount of asset 0 to swap
   * @return Amount of userIn to swap for asset 1
   */
  function calculateSwapInAmount(uint256 reserveIn, uint256 userIn)
    internal
    pure
    returns (uint256)
  {
    return
      (Babylonian.sqrt(reserveIn * (userIn * 3988000 + reserveIn * 3988009)) -
        reserveIn *
        1997) / 1994;
  }
}
