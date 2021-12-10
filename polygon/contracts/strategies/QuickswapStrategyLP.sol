// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "contracts/strategies/ASushiswapStrategy.sol";
import "polygon/contracts/libraries/QuickSwapLibrary.sol";
import "polygon/contracts/interfaces/quickswap/IStakingRewardsFactory.sol";
import "polygon/contracts/interfaces/quickswap/IStakingRewards.sol";
import "polygon/contracts/interfaces/quickswap/IDragonLair.sol";

/**
 * @title Access QuickSwap
 * @notice Add and remove liquidity to QuickSwap
 * @dev Strategy in brief: original assets -> LP -> Quick -> LP.
 */
contract QuickSwapStrategyLP is ASushiswapStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  string public constant name = "Ondo QuickSwap LP Strategy";

  // Pointers to QuickSwap contracts
  IStakingRewardsFactory public immutable stakingRewardsFactory;
  IDragonLair public immutable stakingRewardToken;

  event NewPair(address indexed pool, uint256 pid);

  /**
   * @dev
   * @param _registry Ondo global registry
   * @param _router Router
   * @param _rewardsFactory Rewards factory (holds addresses of staking rewards contracts)
   * @param _factory Factory
   * @param _mainToken ERC20 contract for Quick tokens
   * @param _stakingRewardToken ERC20 contract for stakingRewardToken tokens (dQuick)
   */
  constructor(
    address _registry,
    address _router,
    address _rewardsFactory,
    address _factory,
    address _mainToken,
    address _stakingRewardToken
  ) ASushiswapStrategy(_registry, _router, _factory) {
    require(_rewardsFactory != address(0), "Invalid address");
    require(_mainToken != address(0), "Invalid address");
    require(_stakingRewardToken != address(0), "Invalid address");

    stakingRewardsFactory = IStakingRewardsFactory(_rewardsFactory);
    mainToken = IERC20(_mainToken);
    stakingRewardToken = IDragonLair(_stakingRewardToken);
  }

  /**
   * Get pair from quickswap
   */
  function getPair(address senior, address junior)
    internal
    view
    override
    returns (address)
  {
    return QuickSwapLibrary.pairFor(uniFactory, senior, junior);
  }

  /**
   * Remove LPs from the vault
   */
  function _removeLp(PoolData storage poolData, uint256 userLp)
    internal
    override
  {
    uint256 mainTokenAmt = mainToken.balanceOf(address(this));
    if (userLp > 0) {
      IStakingRewards stakingRewards =
        IStakingRewards(poolData.stakingRewardsContract);
      stakingRewards.withdraw(userLp);
    }
    mainTokenAmt = mainToken.balanceOf(address(this)) - mainTokenAmt;
    uint256 stakingRewardTokenAmt = stakingRewardToken.balanceOf(address(this));
    mainToken.ondoSafeIncreaseAllowance(
      address(stakingRewardToken),
      mainTokenAmt
    );
    stakingRewardToken.enter(mainTokenAmt);
    poolData.pendingStakingRewardToken +=
      stakingRewardToken.balanceOf(address(this)) -
      stakingRewardTokenAmt;
  }

  /**
   * Add LPs to a running vault
   */
  function midTermDepositLp(IERC20 pool, uint256 _lpTokens) internal override {
    PoolData storage poolData = pools[address(pool)];
    uint256 mainTokenAmt = mainToken.balanceOf(address(this));
    IStakingRewards stakingRewards =
      IStakingRewards(poolData.stakingRewardsContract);
    pool.ondoSafeIncreaseAllowance(address(stakingRewards), _lpTokens);
    if (_lpTokens > 0) {
      stakingRewards.stake(_lpTokens);
    }
    mainTokenAmt = mainToken.balanceOf(address(this)) - mainTokenAmt;
    uint256 stakingRewardTokenAmt = stakingRewardToken.balanceOf(address(this));
    mainToken.ondoSafeIncreaseAllowance(
      address(stakingRewardToken),
      mainTokenAmt
    );
    stakingRewardToken.enter(mainTokenAmt);
    poolData.pendingStakingRewardToken +=
      stakingRewardToken.balanceOf(address(this)) -
      stakingRewardTokenAmt;
  }

  /**
   * @notice Add info about pool
   * @dev
   * @param _pool QuickSwap pool
   * @param _pid Pool ID (not used for staking, legacy thing)
   * @param pathFromMainToken Conversion route for asset 0
   */
  function addPool(
    address _pool,
    uint256 _pid,
    address[] calldata pathFromMainToken
  ) external override whenNotPaused isAuthorized(OLib.STRATEGIST_ROLE) {
    require(!pools[_pool]._isSet, "Pool ID already registered");
    require(_pool != address(0), "Cannot be zero address");

    _addPool(_pool, pathFromMainToken);

    address stakingRewardsAddress =
      address(
        stakingRewardsFactory
          .stakingRewardsInfoByStakingToken(_pool)
          .stakingRewards
      );
    require(stakingRewardsAddress != address(0), "Cannot be zero address");
    pools[_pool].stakingRewardsContract = stakingRewardsAddress;

    emit NewPair(_pool, _pid);
  }

  /**
   * @notice Reinvest Quick into LP tokens
   * @param pool QuickSwap pool
   * @param poolData Info about current state of pool investments
   */
  function _compound(IERC20 pool, PoolData storage poolData)
    internal
    override
    returns (uint256 lpAmt)
  {
    uint256 mainTokenAmt = mainToken.balanceOf(address(this));
    IStakingRewards stakingRewards =
      IStakingRewards(poolData.stakingRewardsContract);
    stakingRewards.getReward(); // Called to trigger update in amount of Quick truly available now
    stakingRewardToken.leave(poolData.pendingStakingRewardToken);
    address stakingContractAddress = address(poolData.stakingRewardsContract);

    lpAmt = _getLPsFromStakingRewardsForReinvesting(
      pool,
      mainTokenAmt,
      poolData,
      stakingContractAddress
    );

    if (pool.balanceOf(address(this)) > 0) {
      stakingRewards.stake(pool.balanceOf(address(this)));
    }
  }

  /**
   * Get reserves from quickswap
   */
  function getReservesFromLibrary(
    address uniFactory,
    address tokenA,
    address tokenB
  ) internal view override returns (uint256 reserveA, uint256 reserveB) {
    return QuickSwapLibrary.getReserves(uniFactory, tokenA, tokenB);
  }

  /**
   * Withdraw assets that are being staked
   */
  function withdrawFromStaking(uint256 vaultId)
    internal
    override
    returns (uint256 lpTokens)
  {
    PoolData memory poolData;
    (poolData, lpTokens) = _withdrawFromStaking(vaultId);
    if (lpTokens > 0) {
      IStakingRewards stakingRewards =
        IStakingRewards(poolData.stakingRewardsContract);
      stakingRewards.withdraw(lpTokens);
    }
    return lpTokens;
  }

  /**
   * Get amounts from quickswap
   */
  function getAmountsOut(uint256 juniorReceived, address[] memory jr2Sr)
    internal
    view
    override
    returns (uint256[] memory)
  {
    return QuickSwapLibrary.getAmountsOut(uniFactory, juniorReceived, jr2Sr);
  }
}
