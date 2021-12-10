// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "contracts/strategies/ASushiswapStrategy.sol";
import "bsc/contracts/libraries/PancakeSwapLibrary.sol";
import "bsc/contracts/interfaces/pancakeswap/IPancakeMasterChef.sol";

/**
 * @title Access Pancakeswap
 * @notice Add and remove liquidity to Pancakeswap
 * @dev Strategy in brief: original assets -> LP -> Cake -> LP.
 */
contract PancakeStrategyLP is ASushiswapStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  string public constant name = "Ondo PancakeSwap LP Strategy";

  // Pointers to Pancakeswap contracts
  IPancakeMasterChef public immutable masterChef;

  event NewPair(address indexed pool, uint256 pid);

  /**
   * @dev
   * @param _registry Ondo global registry
   * @param _router Router
   * @param _chef Pancakeswap contract that handles mining incentives
   * @param _factory Factory
   * @param _cake ERC20 contract for Cake tokens
   */
  constructor(
    address _registry,
    address _router,
    address _chef,
    address _factory,
    address _cake
  ) ASushiswapStrategy(_registry, _router, _factory) {
    require(_chef != address(0), "Invalid address");
    require(_cake != address(0), "Invalid address");

    masterChef = IPancakeMasterChef(_chef);
    mainToken = IERC20(_cake);
  }

  /**
   * Get pair from Pancake
   */
  function getPair(address senior, address junior)
    internal
    view
    override
    returns (address)
  {
    return PancakeSwapLibrary.pairFor(uniFactory, senior, junior);
  }

  /**
   * Remove LPs from the vault
   */
  function _removeLp(PoolData storage poolData, uint256 userLp)
    internal
    override
  {
    uint256 mainTokenAmt = mainToken.balanceOf(address(this));
    masterChef.withdraw(poolData.pid, userLp);
    mainTokenAmt = mainToken.balanceOf(address(this)) - mainTokenAmt;
    uint256 syrupAmt = masterChef.syrup().balanceOf(address(this));
    mainToken.ondoSafeIncreaseAllowance(address(masterChef), mainTokenAmt);
    masterChef.enterStaking(mainTokenAmt);
    poolData.pendingStakingRewardToken +=
      masterChef.syrup().balanceOf(address(this)) -
      syrupAmt;
  }

  /**
   * Add LPs to a running vault
   */
  function midTermDepositLp(IERC20 pool, uint256 _lpTokens) internal override {
    PoolData storage poolData = pools[address(pool)];
    uint256 mainTokenAmt = mainToken.balanceOf(address(this));
    pool.ondoSafeIncreaseAllowance(address(masterChef), _lpTokens);
    masterChef.deposit(pools[address(pool)].pid, _lpTokens);
    mainTokenAmt = mainToken.balanceOf(address(this)) - mainTokenAmt;
    uint256 syrupAmt = masterChef.syrup().balanceOf(address(this));
    mainToken.ondoSafeIncreaseAllowance(address(masterChef), mainTokenAmt);
    masterChef.enterStaking(mainTokenAmt);
    poolData.pendingStakingRewardToken +=
      masterChef.syrup().balanceOf(address(this)) -
      syrupAmt;
  }

  /**
   * @notice Add info about pool
   * @dev
   * @param _pool Pancakeswap pool
   * @param _pid Id of Pool from Pancakeswap
   * @param pathFromMainToken Conversion route for asset 0
   */
  function addPool(
    address _pool,
    uint256 _pid,
    address[] calldata pathFromMainToken
  ) external override whenNotPaused isAuthorized(OLib.STRATEGIST_ROLE) {
    require(!pools[_pool]._isSet, "Pool ID already registered");
    require(_pool != address(0), "Cannot be zero address");
    IPancakeMasterChef.PoolInfo memory poolInfo = masterChef.poolInfo(_pid);
    require(address(poolInfo.lpToken) == _pool, "Pool ID does not match pool");

    _addPool(_pool, pathFromMainToken);

    pools[_pool].pid = _pid;

    emit NewPair(_pool, _pid);
  }

  /**
   * @notice Reinvest cake into LP tokens
   * @param pool Pancakeswap pool
   * @param poolData Info about current state of pool investments
   */
  function _compound(IERC20 pool, PoolData storage poolData)
    internal
    override
    returns (uint256 lpAmt)
  {
    uint256 mainTokenAmt = mainToken.balanceOf(address(this));
    masterChef.deposit(poolData.pid, 0); // Called to trigger update in amount of cake truly available now
    masterChef.leaveStaking(poolData.pendingStakingRewardToken);
    address stakingContractAddress = address(masterChef);

    lpAmt = _getLPsFromStakingRewardsForReinvesting(
      pool,
      mainTokenAmt,
      poolData,
      stakingContractAddress
    );

    masterChef.deposit(poolData.pid, pool.balanceOf(address(this)));
  }

  /**
   * Get reserves from Pancake
   */
  function getReservesFromLibrary(
    address uniFactory,
    address tokenA,
    address tokenB
  ) internal view override returns (uint256 reserveA, uint256 reserveB) {
    return PancakeSwapLibrary.getReserves(uniFactory, tokenA, tokenB);
  }

  /**
   * Withdraw assets that are being staked
   */
  function withdrawFromStaking(uint256 vaultId)
    internal
    override
    returns (uint256 lpTokens)
  {
    (PoolData memory poolData, uint256 lpTokens) =
      _withdrawFromStaking(vaultId);
    masterChef.withdraw(poolData.pid, lpTokens);
    return lpTokens;
  }

  /**
   * Get amounts from Pancake
   */
  function getAmountsOut(uint256 juniorReceived, address[] memory jr2Sr)
    internal
    view
    override
    returns (uint256[] memory)
  {
    return PancakeSwapLibrary.getAmountsOut(uniFactory, juniorReceived, jr2Sr);
  }
}
