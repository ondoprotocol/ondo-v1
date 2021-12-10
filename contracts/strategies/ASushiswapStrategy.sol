// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "@openzeppelin/contracts/utils/Counters.sol";
import "contracts/strategies/AUniswapStrategy.sol";
import "contracts/libraries/OndoLibrary.sol";
import "contracts/vendor/abdk/ABDKMathQuad.sol";

/**
 * @title Abstract "Sushi-like" strategy
 */
abstract contract ASushiswapStrategy is AUniswapStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  struct PoolData {
    address[] pathFromMainToken;
    address stakingRewardsContract; // If it's needed.
    uint256 pid; // If it's needed, otherwise it's a dummy value
    uint256 totalShares;
    uint256 totalLp;
    uint256 pendingStakingRewardToken;
    bool _isSet;
  }

  mapping(address => PoolData) public pools;
  mapping(address => uint256) public lastHarvestBlock;

  IERC20 public mainToken;

  /**
   * @dev
   * @param _registry Ondo global registry
   * @param _router Router
   * @param _factory Factory
   */
  constructor(
    address _registry,
    address _router,
    address _factory
  ) AUniswapStrategy(_registry, _router, _factory, 1) {
    registry = Registry(_registry);
  }

  /**
   * @notice Conversion of LP tokens to shares
   * @param vaultId Vault
   * @param lpTokens Amount of LP tokens
   * @return Number of shares for LP tokens
   * @return Total shares for this Vault
   * @return pool
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
    _removeLp(poolData, userLp);
    vault_.shares -= _shares;
    poolData.totalShares -= _shares;
    poolData.totalLp -= userLp;
    IERC20(vault_.pool).safeTransfer(to, userLp);
  }

  /**
   * Helper function for removeLp(). Needed as removing LPs has different implementation depending on a strategy.
   */
  function _removeLp(PoolData storage poolData, uint256 userLp)
    internal
    virtual;

  /**
   * Requires implementation as removing LPs is done differently depending on a strategy.
   */
  function midTermDepositLp(IERC20 pool, uint256 _lpTokens) internal virtual;

  /**
   * Get path for tokens
   */
  function getMainTokenPath(address[] storage pathFromMainToken)
    internal
    view
    returns (address[] memory path)
  {
    path = new address[](pathFromMainToken.length + 1);
    path[0] = address(mainToken);
    for (uint256 i = 0; i < pathFromMainToken.length; i++) {
      path[i + 1] = pathFromMainToken[i];
    }
  }

  /**
   * @notice Add info about pool
   * @dev
   * @param _pool pool
   * @param _pid Id of Pool (optional, could be a dummy value that is not used in some of the strategies)
   * @param pathFromMainToken Conversion route for asset 0
   */
  function addPool(
    address _pool,
    uint256 _pid,
    address[] calldata pathFromMainToken
  ) external virtual whenNotPaused isAuthorized(OLib.STRATEGIST_ROLE) {
    require(!pools[_pool]._isSet, "Pool ID already registered");
    require(_pool != address(0), "Cannot be zero address");

    _addPool(_pool, pathFromMainToken);
  }

  /**
   * Helper function for addPool()
   */
  function _addPool(address _pool, address[] calldata pathFromMainToken)
    internal
  {
    address token0 = IUniswapV2Pair(_pool).token0();
    address token1 = IUniswapV2Pair(_pool).token1();
    bool oneMainToken =
      token0 == address(mainToken) || token1 == address(mainToken);
    require(
      (oneMainToken && pathFromMainToken.length == 0) || !oneMainToken,
      "Pool either must have main token and zero length or no main token in pool"
    );
    if (pathFromMainToken.length != 0) {
      address endToken = pathFromMainToken[pathFromMainToken.length - 1];
      require(
        token0 == endToken || token1 == endToken,
        "Not a valid path for pool"
      );
      pools[_pool].pathFromMainToken = pathFromMainToken;
    }

    pools[_pool]._isSet = true;
  }

  /**
   * @notice If needed to update path from main token
   * @param _pool pool
   * @param pathFromMainToken Path from main token to asset 0
   */
  function updatePool(address _pool, address[] calldata pathFromMainToken)
    external
    nonReentrant
    whenNotPaused
    isAuthorized(OLib.STRATEGIST_ROLE)
  {
    require(pools[_pool]._isSet, "Pool ID not yet registered");
    address token0 = IUniswapV2Pair(_pool).token0();
    address token1 = IUniswapV2Pair(_pool).token1();
    require(
      token0 != address(mainToken) && token1 != address(mainToken),
      "Should never need to update pool with main token"
    );
    address endToken = pathFromMainToken[pathFromMainToken.length - 1];
    require(
      IUniswapV2Pair(_pool).token0() == endToken ||
        IUniswapV2Pair(_pool).token1() == endToken,
      "Not a valid path for pool"
    );
    PoolData storage poolData = pools[_pool];
    delete poolData.pathFromMainToken;
    pools[_pool].pathFromMainToken = pathFromMainToken;
  }

  /**
   * @notice Reinvest main token into LP tokens. Should be overridden as the implementation is different for different strategies.
   * @param pool pool
   * @param poolData Info about current state of pool investments
   */
  function _compound(IERC20 pool, PoolData storage poolData)
    internal
    virtual
    returns (uint256 lpAmt);

  /**
   * Helper function for _compound()
   */
  function _getLPsFromStakingRewardsForReinvesting(
    IERC20 pool,
    uint256 mainTokenAmt,
    PoolData storage poolData,
    address stakingContractAddress
  ) internal returns (uint256 lpAmt) {
    poolData.pendingStakingRewardToken = 0;
    lpAmt = 0;
    mainTokenAmt = mainToken.balanceOf(address(this)) - mainTokenAmt;

    if (mainTokenAmt > 10000) {
      // 10k is a minimum amount we should be worried about. Less just doesn't worth the gas even.
      address[] memory pathFromMainToken =
        getMainTokenPath(poolData.pathFromMainToken);
      address tokenA = pathFromMainToken[pathFromMainToken.length - 1];
      address tokenB = IUniswapV2Pair(address(pool)).token0();

      // Exchange staking rewards to assets in order to get more LPs.
      if (tokenB == tokenA) tokenB = IUniswapV2Pair(address(pool)).token1();
      uint256 amt0;
      if (tokenA == address(mainToken)) {
        amt0 = mainTokenAmt;
      } else {
        amt0 = swapExactIn(mainTokenAmt, 0, pathFromMainToken);
      }
      uint256 amt0ToSwap;
      (uint256 reserves0, ) =
        getReservesFromLibrary(uniFactory, tokenA, tokenB);
      amt0 -= (amt0ToSwap = calculateSwapInAmount(reserves0, amt0));
      uint256 amt1 = swapExactIn(amt0ToSwap, 0, getPath(tokenA, tokenB));

      // Adding liquidity and getting more LPs.
      (, , lpAmt) = addLiquidity(tokenA, tokenB, amt0, amt1, 0, 0);
      poolData.totalLp += lpAmt;
    }

    pool.ondoSafeIncreaseAllowance(
      stakingContractAddress,
      pool.balanceOf(address(this))
    );

    return lpAmt;
  }

  /**
   * Get reserves from Uniswap library (can be changed to a different library depending on a strategy)
   */
  function getReservesFromLibrary(
    address uniFactory,
    address tokenA,
    address tokenB
  ) internal view virtual returns (uint256 reserveA, uint256 reserveB) {
    return UniswapV2Library.getReserves(uniFactory, tokenA, tokenB);
  }

  /**
   * Stake LPs
   */
  function depositIntoStaking(uint256 vaultId, uint256 _amount) internal {
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

  /**
   * Return LPs that are being staked
   */
  function withdrawFromStaking(uint256 vaultId)
    internal
    virtual
    returns (uint256 lpTokens)
  {
    _withdrawFromStaking(vaultId);
    return lpTokens;
  }

  /**
   * Helper function for withdrawFromStaking()
   */
  function _withdrawFromStaking(uint256 vaultId)
    internal
    returns (PoolData storage poolData, uint256 lpTokens)
  {
    Vault storage vault = vaults[vaultId];
    IERC20 pool = vault.pool;
    poolData = pools[address(pool)];
    _compound(pool, poolData);
    lpTokens = vault.shares == poolData.totalShares
      ? poolData.totalLp
      : (poolData.totalLp * vault.shares) / poolData.totalShares;
    poolData.totalLp -= lpTokens;
    poolData.totalShares -= vault.shares;
    vault.shares = 0;
    return (poolData, lpTokens);
  }

  /**
   * @notice Periodically reinvest staking/reward tokens into LP tokens
   * @param pool pool to reinvest
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
    (seniorInvested, juniorInvested, lpTokens) = _invest(
      _vaultId,
      _totalSenior,
      _totalJunior,
      _extraSenior,
      _extraJunior,
      _seniorMinIn,
      _juniorMinIn
    );
    depositIntoStaking(_vaultId, lpTokens);
    emit Invest(_vaultId, lpTokens);
  }

  /**
   * @dev Convert all LP tokens back into the pair of underlying
   *      assets. Also convert any staking rewards tokens equally into both tranches.
   * @param _vaultId Reference to a specific Vault
   * @param _seniorExpected Amount the senior tranche is expecting
   * @param _seniorMinReceived Compute total for seniorReceived, factoring in slippage
   * @param _juniorMinReceived Same.
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
    vault_.shares = withdrawFromStaking(_vaultId);
    return
      _redeem(
        _vaultId,
        vault_.shares,
        _seniorExpected,
        _seniorMinReceived,
        _juniorMinReceived
      );
  }
}
