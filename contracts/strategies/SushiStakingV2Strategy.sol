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
import "contracts/vendor/sushiswap/IMasterChefV2.sol";
import "contracts/libraries/OndoLibrary.sol";
import "contracts/interfaces/IUserTriggeredReward.sol";

/**
 * @title Access Sushiswap
 * @notice Add and remove liquidity to Sushiswap
 * @dev Though Sushiswap ripped off Uniswap, there is an extra step of
 *      dealing with mining incentives. Unfortunately some of this info is
 *      not in the Sushiswap contracts. This strategy will occasionally sell
 *      Sushi for more senior/junior assets to reinvest as more LP. This cycle
 *      continues: original assets -> LP -> sushi -> LP.
 */
contract SushiStakingV2Strategy is BasePairLPStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  string public constant name = "Ondo MasterChefV2 Staking Strategy v1.1";

  struct PoolData {
    uint256 pid;
    address[][2] pathsFromRewards;
    uint256 totalShares;
    uint256 totalLp;
    uint256 accRewardToken;
    IUserTriggeredReward extraRewardHandler;
    bool _isSet; // can't use pid because pid 0 is usdt/eth
  }

  struct Call {
    address target;
    bytes data;
  }

  mapping(address => PoolData) public pools;

  // Pointers to Sushiswap contracts
  IUniswapV2Router02 public immutable sushiRouter;
  IERC20 public immutable sushiToken;
  IMasterChefV2 public immutable masterChef;
  address public immutable sushiFactory;

  uint256 public constant sharesToLpRatio = 10e15;

  event NewPair(address indexed pool, uint256 pid);

  /**
   * @dev
   * @param _registry Ondo global registry
   * @param _router Address for UniswapV2Router02 for Sushiswap
   * @param _chef Sushiswap contract that handles mining incentives
   * @param _factory Address for UniswapV2Factory for Sushiswap
   * @param _sushi ERC20 contract for Sushi tokens
   */
  constructor(
    address _registry,
    address _router,
    address _chef,
    address _factory,
    address _sushi
  ) BasePairLPStrategy(_registry) {
    require(_router != address(0), "Invalid address");
    require(_chef != address(0), "Invalid address");
    require(_factory != address(0), "Invalid address");
    require(_sushi != address(0), "Invalid address");
    registry = Registry(_registry);
    sushiRouter = IUniswapV2Router02(_router);
    sushiToken = IERC20(_sushi);
    masterChef = IMasterChefV2(_chef);
    sushiFactory = _factory;
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
    require(to != address(0), "No zero address");
    Vault storage vault_ = vaults[_vaultId];
    PoolData storage poolData = pools[address(vault_.pool)];
    (uint256 userLp, ) = lpFromShares(_vaultId, _shares);
    IERC20 rewardToken = IERC20(poolData.pathsFromRewards[1][0]);
    uint256 rewardTokenAmt = rewardToken.balanceOf(address(this));
    masterChef.withdraw(poolData.pid, userLp, address(this));
    rewardTokenAmt = rewardToken.balanceOf(address(this)) - rewardTokenAmt;
    if (address(poolData.extraRewardHandler) != address(0)) {
      rewardToken.safeTransfer(
        address(poolData.extraRewardHandler),
        rewardTokenAmt
      );
      poolData.extraRewardHandler.invest(rewardTokenAmt);
    } else {
      poolData.accRewardToken += rewardTokenAmt;
    }
    vault_.shares -= _shares;
    poolData.totalShares -= _shares;
    poolData.totalLp -= userLp;
    IERC20(vault_.pool).safeTransfer(to, userLp);
  }

  // @dev harvest must be a controlled function b/c engages with uniswap
  // in mean time, can gain sushi rewards on sushi gained
  // from depositing into masterchef mid term
  function midTermDepositLp(IERC20 pool, uint256 _lpTokens) internal {
    PoolData storage poolData = pools[address(pool)];
    IERC20 rewardToken = IERC20(poolData.pathsFromRewards[1][0]);
    uint256 rewardTokenAmt = rewardToken.balanceOf(address(this));
    pool.ondoSafeIncreaseAllowance(address(masterChef), _lpTokens);
    masterChef.deposit(pools[address(pool)].pid, _lpTokens, address(this));
    rewardTokenAmt = rewardToken.balanceOf(address(this)) - rewardTokenAmt;
    // in some cases such as the ETH/ALCX LP staking pool, the rewarder contract triggered by MasterChef V2 emits rewards when
    // the balance of LP staked in MasterChef is updated (ie. on a new deposit/withdrawal from an address with an existing balance).
    // (This behavior was present in the original MasterChef contract itself, though it is not in V2.)
    // Thus, when users deposit and withdraw LP between harvests, the rewards (not in SUSHI, but the other token) emitted to the strategy
    // have to be accounted for, because:
    // (1) we can't allow users to trigger compounding (swaps) because of flash loan vulnerability
    // (2) we compound only on the new rewards received from harvesting, so these "extra" rewards would be lost/stuck.
    // Instead, we handle this in one of two ways, on a per-pool basis:
    // (1) pool.accRewardToken tracks the amount of reward tokens sent to the contract by the rewarder between harvests.
    // Each pool has its own accRewardToken so that the "extra" rewards emitted to pools with LP deposit/withdrawal activity are not
    // collectivized across the strategy.
    // (2) these "extra" reward tokens are sent on to a secondary strategy, pool.extraRewardHandler, if there is a way to earn yield on
    // them without swapping, such as the Alchemix single-asset ALCX staking pool.
    if (address(poolData.extraRewardHandler) != address(0)) {
      rewardToken.safeTransfer(
        address(poolData.extraRewardHandler),
        rewardTokenAmt
      );
      poolData.extraRewardHandler.invest(rewardTokenAmt);
    } else {
      poolData.accRewardToken += rewardTokenAmt;
    }
  }

  function addPool(
    address _pool,
    uint256 _pid,
    address[][2] memory _pathsFromRewards,
    address _extraRewardHandler
  ) external whenNotPaused isAuthorized(OLib.STRATEGIST_ROLE) {
    require(!pools[_pool]._isSet, "Pool already registered");
    require(_pool != address(0), "Cannot be zero address");

    address lpToken = masterChef.lpToken(_pid);
    require(lpToken == _pool, "LP Token does not match");
    require(
      _pathsFromRewards[0][0] == address(sushiToken) &&
        _pathsFromRewards[1][0] != address(sushiToken),
      "First path must be from SUSHI"
    );
    address token0 = IUniswapV2Pair(_pool).token0();
    address token1 = IUniswapV2Pair(_pool).token1();
    for (uint256 i = 0; i < 2; i++) {
      address rewardToken = _pathsFromRewards[i][0];
      if (rewardToken == token0 || rewardToken == token1) {
        require(_pathsFromRewards[i].length == 1, "Invalid path");
      } else {
        address endToken =
          _pathsFromRewards[i][_pathsFromRewards[i].length - 1];
        require(endToken == token0 || endToken == token1, "Invalid path");
      }
    }
    pools[_pool].pathsFromRewards = _pathsFromRewards;

    pools[_pool].pid = _pid;
    pools[_pool]._isSet = true;
    pools[_pool].extraRewardHandler = IUserTriggeredReward(_extraRewardHandler);

    emit NewPair(_pool, _pid);
  }

  function updateRewardPath(address _pool, address[] calldata _pathFromReward)
    external
    whenNotPaused
    isAuthorized(OLib.STRATEGIST_ROLE)
    returns (bool success)
  {
    require(pools[_pool]._isSet, "Pool ID not yet registered");
    address rewardToken = _pathFromReward[0];
    address endToken = _pathFromReward[_pathFromReward.length - 1];
    require(
      rewardToken != endToken || _pathFromReward.length == 1,
      "Invalid path"
    );
    address token0 = IUniswapV2Pair(_pool).token0();
    address token1 = IUniswapV2Pair(_pool).token1();
    PoolData storage poolData = pools[_pool];
    if (rewardToken == address(sushiToken)) {
      poolData.pathsFromRewards[0] = _pathFromReward;
      success = true;
    } else if (rewardToken == poolData.pathsFromRewards[1][0]) {
      poolData.pathsFromRewards[1] = _pathFromReward;
      success = true;
    } else {
      success = false;
    }
  }

  function _compound(IERC20 _pool, PoolData storage _poolData)
    internal
    returns (uint256 lpAmount)
  {
    // since some pools may include SUSHI or the dual reward token in the pair, resulting
    // in the strategy holding withdrawable balances of those tokens for expired vaults,
    // we initialize the contract's balance and then take the diff after harvesting
    uint256 sushiAmount = sushiToken.balanceOf(address(this));
    IERC20 rewardToken = IERC20(_poolData.pathsFromRewards[1][0]);
    uint256 rewardTokenAmount = rewardToken.balanceOf(address(this));
    masterChef.harvest(_poolData.pid, address(this));
    // see comments from line 207 in midtermDeposit for documentation explaining the following code
    if (address(_poolData.extraRewardHandler) != address(0)) {
      _poolData.extraRewardHandler.withdraw();
    }
    sushiAmount = sushiToken.balanceOf(address(this)) - sushiAmount;
    rewardTokenAmount =
      rewardToken.balanceOf(address(this)) -
      rewardTokenAmount +
      _poolData.accRewardToken;
    _poolData.accRewardToken = 0;
    // to prevent new vaults from receiving a disproportionate share of the pool, this function is called by invest(). consequently,
    // we have to account for the case in which it is triggered by investing the first vault created for a given pool, since there will
    // not be any rewards after calling harvest, leave, etc. above. we constrain on 1 (10^-18) instead of 0 because of a quirk in
    // MasterChef's bookkeeping that can result in transferring a reward amount of 1 even if there is currently no LP balance
    // deposited in it.
    if (sushiAmount > 10000 && rewardTokenAmount > 10000) {
      IUniswapV2Pair pool = IUniswapV2Pair(address(_pool));
      // tokenAmountsArray will keep track of the token amounts to be reinvested throughout the series of swaps, updating in place.
      // here, it starts as the initially harvested SUSHI and dual reward token amounts. the order semantics are fixed, and match
      // poolInfo.pathsFromRewards - see addPool() and updateRewardPath() above
      uint256[] memory tokenAmountsArray = new uint256[](2);
      tokenAmountsArray[0] = sushiAmount;
      tokenAmountsArray[1] = rewardTokenAmount;
      for (uint256 i = 0; i < 2; i++) {
        // the first element in the swap path is the reward token itself, so an array length of 1 indicates that the token
        // is also one of the LP assets and thus does not need to be swapped
        if (
          tokenAmountsArray[i] > 0 && _poolData.pathsFromRewards[i].length > 1
        ) {
          // if the reward token does need to be swapped into one of the LP assets, that harvestAmount is updated in place with
          // the amount of LP asset received, now representing a token amount that can be passed into addLiquidity()
          tokenAmountsArray[i] = swapExactIn(
            tokenAmountsArray[i],
            // internal swap calls do not set a minimum amount received, which is constrained only after compounding, on LP received
            0,
            _poolData.pathsFromRewards[i]
          );
        }
      }
      // since the first element of pathsFromRewards is always the SUSHI swap path, tokenA is SUSHI if that is one of the LP assets,
      // or otherwise the LP asset we've chosen to swap SUSHI rewards for. we use 'A' and 'B' to avoid confusion with the token0 and token1
      // values of the UniswapV2Pair contract, which represent the same tokens but in a specific order that this function doesn't care about
      address tokenA =
        _poolData.pathsFromRewards[0][_poolData.pathsFromRewards[0].length - 1];
      // tokenB is the other asset in the LP
      address tokenB = IUniswapV2Pair(address(pool)).token0();
      if (tokenB == tokenA) tokenB = IUniswapV2Pair(address(pool)).token1();
      // there are two cases: either both rewards (SUSHI and dual) have now been converted to amounts of the same LP asset, or to
      // amounts of each LP asset
      bool sameTarget =
        tokenA ==
          _poolData.pathsFromRewards[1][
            _poolData.pathsFromRewards[1].length - 1
          ];
      if (sameTarget) {
        // this is the case in which we are starting with two amounts of the same LP asset. we update the first harvestAmount in place
        // to contain the total amount of this asset
        tokenAmountsArray[0] = tokenAmountsArray[0] + tokenAmountsArray[1];
        // we use Zapper's Babylonian method to calculate how much of this total needs to be swapped into the other LP asset in order to
        // addLiquidity without remainder. this is removed from the first harvestAmount, which now represents the final amount of tokenA
        // to be added to the LP, and written into the second harvestAmount, now the amount of tokenA that will be converted to tokenB
        (uint256 reserveA, ) =
          SushiSwapLibrary.getReserves(sushiFactory, tokenA, tokenB);
        tokenAmountsArray[1] = calculateSwapInAmount(
          reserveA,
          tokenAmountsArray[0]
        );
        tokenAmountsArray[0] -= tokenAmountsArray[1];
        // we update the second harvestAmount (amount of tokenA to be swapped) with the amount of tokenB received. tokenAmountsArray now
        // represents balanced LP assets that can be passed into addLiquidity without remainder, resulting in lpAmount = the final
        // compounding result
        tokenAmountsArray[1] = swapExactIn(
          tokenAmountsArray[1],
          0,
          getPath(tokenA, tokenB)
        );
        (, , lpAmount) = addLiquidity(
          tokenA,
          tokenB,
          tokenAmountsArray[0],
          tokenAmountsArray[1]
        );
      } else {
        // in this branch, we have amounts of both LP assets and may need to swap in order to balance them. the zap-in method alone doesn't
        // suffice for this, so to avoid some very tricky and opaque math, we simply:
        // (1) addLiquidity, leaving remainder in at most one LP asset
        // (2) check for a remainder
        // (3) if it exists, zap this amount into balanced amounts of each LP asset
        // (4) addLiquidity again, leaving no remainder
        uint256 amountInA;
        uint256 amountInB;
        (amountInA, amountInB, lpAmount) = addLiquidity(
          tokenA,
          tokenB,
          tokenAmountsArray[0],
          tokenAmountsArray[1]
        );
        // tokenAmountsArray are updated in place to represent the remaining LP assets after adding liquidity. at least one element is 0,
        // and except in the extremely rare case that the amounts were already perfectly balanced, the other element is > 0. the semantics
        // of which element holds a balance of which token remains fixed: [0] is tokenA, which is or was swapped from SUSHI, and [1] is tokenB,
        // which is or was swapped from the dual reward token, and they comprise both of the LP assets.
        tokenAmountsArray[0] -= amountInA;
        tokenAmountsArray[1] -= amountInB;
        require(
          tokenAmountsArray[0] == 0 || tokenAmountsArray[1] == 0,
          "Insufficient liquidity added on one side of first call"
        );
        (uint256 reserveA, uint256 reserveB) =
          SushiSwapLibrary.getReserves(sushiFactory, tokenA, tokenB);
        // in the first branch, the entire original amount of tokenA was added to the LP and is now 0, and there is a nonzero remainder
        // of tokenB. we initialize the swap amount outside the conditional so that at the end we know whether we performed any swaps
        // and therefore need to addLiquidity a second time
        uint256 amountToSwap;
        if (tokenAmountsArray[0] < tokenAmountsArray[1]) {
          // we perform the zap in, swapping tokenB for a balanced amount of tokenA. once again, the harvestAmount swapped from is
          // decremented in place by the swap amount, now available outside the conditional scope, and the amount received from the
          // swap is stored in the other harvestAmount
          amountToSwap = calculateSwapInAmount(reserveB, tokenAmountsArray[1]);
          tokenAmountsArray[1] -= amountToSwap;
          tokenAmountsArray[0] += swapExactIn(
            amountToSwap,
            0,
            getPath(tokenB, tokenA)
          );
        } else if (tokenAmountsArray[0] > 0) {
          // in this branch, there is a nonzero remainder of tokenA, and none of tokenB, recalling that at most one of these
          // balances can be nonzero. the same zap-in procedure is applied, swapping tokenA for tokenB and updating amountToSwap and
          // both tokenAmountsArray. we structure this as an else-if with no further branch because if both amounts are 0, the original amounts
          // were perfectly balanced so we don't need to swap and addLiquidity again.
          amountToSwap = calculateSwapInAmount(reserveA, tokenAmountsArray[0]);
          tokenAmountsArray[0] -= amountToSwap;
          tokenAmountsArray[1] += swapExactIn(
            amountToSwap,
            0,
            getPath(tokenA, tokenB)
          );
        }
        if (amountToSwap > 0) {
          // if amountToSwap was updated in one of the branches above, we have balanced nonzero amounts of both LP assets
          // and need to addLiquidity again
          (, , uint256 moreLp) =
            addLiquidity(
              tokenA,
              tokenB,
              tokenAmountsArray[0],
              tokenAmountsArray[1]
            );
          // recall that lpAmount was previously set by the first addLiquidity. if we've just received more, we add it to
          // get the final compounding result, which we include as a named return so that harvest() can constrain it with a
          // minimum that protects against flash price anomalies, whether adversarial or coincidental
          lpAmount += moreLp;
        }
      }
      _poolData.totalLp += lpAmount;
    }
    // we're back in the outermost function scope, where three cases could obtain:
    // (1) this is the first invest() call on this pool, so we called addLiquidity in the body of invest() and never entered
    // the outer conditional above
    // (2) we entered the first branch of the inner conditional, and zapped in a total amount of one LP asset received from
    // swapping both rewards
    // (3) we entered the second branch of the inner conditional, and added balanced liquidity of both LP assets received from
    // swapping each reward
    // in any case, the contract never holds LP tokens outside the duration of a function call, so its current LP balance is
    // the amount we deposit in MasterChef
    _pool.ondoSafeIncreaseAllowance(
      address(masterChef),
      _pool.balanceOf(address(this))
    );
    masterChef.deposit(
      _poolData.pid,
      _pool.balanceOf(address(this)),
      address(this)
    );
  }

  function depositIntoChef(uint256 vaultId, uint256 _amount) internal {
    Vault storage vault = vaults[vaultId];
    IERC20 pool = vault.pool;
    PoolData storage poolData = pools[address(pool)];
    _compound(pool, poolData);
    if (poolData.totalLp == 0 || poolData.totalShares == 0) {
      poolData.totalShares = _amount * sharesToLpRatio;
      poolData.totalLp = _amount;
      vault.shares = _amount * sharesToLpRatio;
    } else {
      uint256 shares = (_amount * poolData.totalShares) / poolData.totalLp;
      poolData.totalShares += shares;
      vault.shares += shares;
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
    lpTokens = vault.shares == poolData.totalShares
      ? poolData.totalLp
      : (poolData.totalLp * vault.shares) / poolData.totalShares;
    poolData.totalLp -= lpTokens;
    poolData.totalShares -= vault.shares;
    vault.shares = 0;
    masterChef.withdraw(poolData.pid, lpTokens, address(this));
    return lpTokens;
  }

  /**
   * @notice Periodically reinvest sushi into LP tokens
   * @param pool Sushiswap pool to reinvest
   */
  function harvest(address pool, uint256 minLp)
    external
    isAuthorized(OLib.STRATEGIST_ROLE)
    whenNotPaused
    returns (uint256)
  {
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
      "Vault already registered"
    );
    require(poolExists(_senior, _junior), "Pool doesn't exist");
    address pair =
      SushiSwapLibrary.pairFor(
        sushiFactory,
        address(_senior),
        address(_junior)
      );
    require(pools[pair]._isSet, "Pool not supported");
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
    uint256 amt1
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
      0,
      0,
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
    vault_.senior.ondoSafeIncreaseAllowance(address(sushiRouter), _totalSenior);
    vault_.junior.ondoSafeIncreaseAllowance(address(sushiRouter), _totalJunior);
    (seniorInvested, juniorInvested, lpTokens) = sushiRouter.addLiquidity(
      address(vault_.senior),
      address(vault_.junior),
      _totalSenior,
      _totalJunior,
      _seniorMinIn,
      _juniorMinIn,
      address(this),
      block.timestamp
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
      "Exceeds maximum slippage"
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
   * @dev This code is cloned from L1242-1253 of UniswapV2_ZapIn_General_V4 at https://etherscan.io/address/0x5ACedBA6C402e2682D312a7b4982eda0Ccf2d2E3#code#L1242
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

  function multiexcall(Call[] calldata calls)
    external
    isAuthorized(OLib.GUARDIAN_ROLE)
    returns (bytes[] memory returnData)
  {
    returnData = new bytes[](calls.length);
    for (uint256 i = 0; i < calls.length; i++) {
      (bool success, bytes memory ret) = calls[i].target.call(calls[i].data);
      require(success, "Multicall aggregate: call failed");
      returnData[i] = ret;
    }
  }
}
