// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/Babylonian.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/strategies/BasePairLPStrategy.sol";
import "contracts/libraries/OndoLibrary.sol";
import "contracts/vendor/uniswap/SushiSwapLibrary.sol";
import "contracts/vendor/sushiswap/ISushiBar.sol";
import "contracts/vendor/sushiswap/IMasterChefV2.sol";
import "contracts/vendor/alchemix/IStakingPools.sol";

contract AlchemixLPStrategy is BasePairLPStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  IERC20 public immutable alcx;
  IERC20 public immutable weth;
  IERC20 public immutable sushi;
  ISushiBar public immutable xsushi;
  IUniswapV2Router02 public immutable sushiRouter;
  address public immutable sushiFactory;
  address public immutable ethAlcxSLP;
  IStakingPools public immutable stakingPools;
  IMasterChefV2 public immutable masterChefV2;
  uint256 public immutable lpPoolId;
  uint256 public immutable alcxPoolId;
  uint256 public lastHarvestBlock;

  struct UserInfo {
    uint256 amount;
    int256 rewardDebt;
  }

  string public constant name = "Ondo ALCX/ETH SLP Alchemix Staking Strategy";

  uint256 public totalShares;
  uint256 public totalLp;

  constructor(
    address _registry,
    address _alcx,
    address _weth,
    address _sushi,
    address _slp,
    address _pool,
    address _router,
    address _factory,
    address _xsushi,
    address _chef,
    uint256 _lpId,
    uint256 _alcxId
  ) BasePairLPStrategy(_registry) {
    require(_alcx != address(0));
    require(_weth != address(0));
    require(_sushi != address(0));
    require(_slp != address(0));
    require(_pool != address(0));
    require(_router != address(0));
    require(_factory != address(0));
    require(_xsushi != address(0));
    sushiRouter = IUniswapV2Router02(_router);
    ethAlcxSLP = _slp;
    alcx = IERC20(_alcx);
    weth = IERC20(_weth);
    sushi = IERC20(_sushi);
    stakingPools = IStakingPools(_pool);
    lpPoolId = _lpId;
    alcxPoolId = _alcxId;
    sushiFactory = _factory;
    xsushi = ISushiBar(_xsushi);
    masterChefV2 = IMasterChefV2(_chef);
  }

  function addVault(
    uint256 _vaultId,
    IERC20 _senior,
    IERC20 _junior
  ) external override whenNotPaused nonReentrant isAuthorized(OLib.VAULT_ROLE) {
    require(
      address(vaults[_vaultId].origin) == address(0),
      "Vault id already registered"
    );
    require(
      (_senior == alcx && _junior == weth) ||
        (_junior == alcx && _senior == weth),
      "Invalid tranche assets"
    );
    vaults[_vaultId].origin = IPairVault(msg.sender);
    vaults[_vaultId].pool = IERC20(ethAlcxSLP);
    vaults[_vaultId].senior = _senior;
    vaults[_vaultId].junior = _junior;
  }

  /**
   * @notice Conversion of LP tokens to shares
   * @param _vaultId Vault
   * @param _lpTokens Amount of LP tokens
   * @return Number of shares for LP tokens
   * @return Total shares for this vault
   * @return Sushiswap pool
   */
  function sharesFromLp(uint256 _vaultId, uint256 _lpTokens)
    public
    view
    override
    returns (
      uint256,
      uint256,
      IERC20
    )
  {
    return (
      (_lpTokens * totalShares) / totalLp,
      vaults[_vaultId].shares,
      IERC20(ethAlcxSLP)
    );
  }

  /**
   * @notice Conversion of shares to LP tokens
   * @param _vaultId Vault
   * @param _shares Amount of shares
   * @return Number LP tokens
   * @return Total shares for this vault
   */
  function lpFromShares(uint256 _vaultId, uint256 _shares)
    public
    view
    override
    returns (uint256, uint256)
  {
    return ((_shares * totalLp) / totalShares, vaults[_vaultId].shares);
  }

  /**
   * @dev Given the total available amounts of senior and junior asset
   *      tokens, invest as much as possible and record any excess uninvested
   *      assets.
   * @param _vaultId Reference to specific vault
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
    Vault storage vault_ = vaults[_vaultId];
    uint256 wethInvested;
    uint256 alcxInvested;
    uint256 lpTokens;
    if (vault_.senior == weth) {
      (wethInvested, alcxInvested, lpTokens) = addLiquidity(
        _totalSenior,
        _totalJunior,
        _seniorMinIn,
        _juniorMinIn
      );
    } else {
      (wethInvested, alcxInvested, lpTokens) = addLiquidity(
        _totalJunior,
        _totalSenior,
        _juniorMinIn,
        _seniorMinIn
      );
    }

    seniorInvested = vault_.senior == weth ? wethInvested : alcxInvested;
    juniorInvested = vault_.junior == alcx ? alcxInvested : wethInvested;
    vault_.seniorExcess = _totalSenior - seniorInvested + _extraSenior;
    vault_.juniorExcess = _totalJunior - juniorInvested + _extraJunior;
    _compound();
    if (totalLp == 0 || totalShares == 0) {
      totalLp = lpTokens;
      totalShares = lpTokens;
      vault_.shares = lpTokens;
    } else {
      uint256 shares = (lpTokens * totalShares) / totalLp;
      totalShares += shares;
      vault_.shares = shares;
      totalLp += lpTokens;
    }
    emit Invest(_vaultId, lpTokens);
  }

  /**
   * @notice Add LP tokens while vault is live
   * @dev Maintain the amount of lp deposited directly
   * @param _vaultId vault
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
    (uint256 userShares, , ) = sharesFromLp(_vaultId, _lpTokens);
    vault_.shares += userShares;
    totalShares += userShares;
    totalLp += _lpTokens;
    uint256 alcxAmount = alcx.balanceOf(address(this));
    IERC20(ethAlcxSLP).ondoSafeIncreaseAllowance(
      address(masterChefV2),
      _lpTokens
    );
    uint256 sushiAmount = sushi.balanceOf(address(this));
    masterChefV2.deposit(lpPoolId, _lpTokens, address(this));
    masterChefV2.harvest(lpPoolId, address(this));
    alcxAmount = alcx.balanceOf(address(this)) - alcxAmount;
    sushiAmount = sushi.balanceOf(address(this)) - sushiAmount;
    sushi.ondoSafeIncreaseAllowance(address(xsushi), sushiAmount);
    xsushi.enter(sushiAmount);
    IERC20(alcx).ondoSafeIncreaseAllowance(address(stakingPools), alcxAmount);
    stakingPools.deposit(alcxPoolId, alcxAmount);
  }

  /**
   * @notice Remove LP tokens while vault is live
   * @dev
   * @param _vaultId vault
   * @param _shares Number of shares
   * @param _to Send LP tokens here
   */
  function removeLp(
    uint256 _vaultId,
    uint256 _shares,
    address _to
  ) external override whenNotPaused onlyOrigin(_vaultId) {
    require(
      block.number > lastHarvestBlock,
      "Can not withdrawLp in same block as harvest call"
    );
    Vault storage vault_ = vaults[_vaultId];
    (uint256 userLp, ) = lpFromShares(_vaultId, _shares);
    uint256 alcxAmount = alcx.balanceOf(address(this));
    uint256 sushiAmount = sushi.balanceOf(address(this));
    masterChefV2.withdrawAndHarvest(lpPoolId, userLp, address(this));
    alcxAmount = alcx.balanceOf(address(this)) - alcxAmount;
    IERC20(alcx).ondoSafeIncreaseAllowance(address(stakingPools), alcxAmount);
    stakingPools.deposit(alcxPoolId, alcxAmount);
    sushiAmount = sushi.balanceOf(address(this)) - sushiAmount;
    sushi.ondoSafeIncreaseAllowance(address(xsushi), sushiAmount);
    xsushi.enter(sushiAmount);
    vault_.shares -= _shares;
    totalShares -= _shares;
    totalLp -= userLp;
    IERC20(ethAlcxSLP).safeTransfer(_to, userLp);
  }

  function addLiquidity(
    uint256 wethAmount,
    uint256 alcxAmount,
    uint256 minWethOut,
    uint256 minAlcxOut
  )
    internal
    returns (
      uint256 wethOut,
      uint256 alcxOut,
      uint256 lp
    )
  {
    IERC20(weth).ondoSafeIncreaseAllowance(address(sushiRouter), wethAmount);
    IERC20(alcx).ondoSafeIncreaseAllowance(address(sushiRouter), alcxAmount);
    (wethOut, alcxOut, lp) = sushiRouter.addLiquidity(
      address(weth),
      address(alcx),
      wethAmount,
      alcxAmount,
      minWethOut,
      minAlcxOut,
      address(this),
      block.timestamp
    );
  }

  function harvest(uint256 _minLp)
    external
    nonReentrant
    whenNotPaused
    isAuthorized(OLib.STRATEGIST_ROLE)
    returns (uint256)
  {
    lastHarvestBlock = block.number;
    uint256 lpAmount = _compound();
    require(lpAmount >= _minLp, "Exceeds maximum slippage");
    emit Harvest(address(ethAlcxSLP), lpAmount);
    return lpAmount;
  }

  function _compound() internal returns (uint256 lpAmount) {
    // get amount before
    uint256 alcxAmount = alcx.balanceOf(address(this));
    // get sushi tokens and alcx
    masterChefV2.harvest(lpPoolId, address(this));
    // leave sushibar
    xsushi.leave(xsushi.balanceOf(address(this)));
    // leave single asset alcx stakingPool
    stakingPools.exit(alcxPoolId);
    // get the difference in amount
    alcxAmount = alcx.balanceOf(address(this)) - alcxAmount;
    // so we have sushi but the underlying pair is alcx/weth
    // so we have to convert sushi rewards into one of the underlying pairs
    // in this case we choose eth
    uint256 ethAmount;
    {
      // get sushi balance
      uint256 sushiAmount = sushi.balanceOf(address(this));
      // if we have sushi then convert to weth
      if (sushiAmount > 0) {
        // get whatever weth we can for sushi
        ethAmount = swapExactIn(
          sushiAmount,
          0,
          getPath(address(sushi), address(weth))
        );
      }
    }
    // we gained alcx from singler asset staking pool
    // we got eth from swapping sushi into eth [weth actually]
    if (alcxAmount > 0 || ethAmount > 0) {
      {
        // we know at this point that we have both tokens and the idea is that we can
        // add liquidity and one of them will get zero without needing to do any conversion
        // so we just add liquidity and try to get one of them to be a zero amount
        uint256 ethAdded;
        uint256 alcxAdded;
        // add liquidity since we have both some amount of both tokens, eventhough they dont have the same value, so we know that atleast one of them will not
        // be able get added with the full amount
        (ethAdded, alcxAdded, lpAmount) = addLiquidity(
          ethAmount,
          alcxAmount,
          0,
          0
        );
        // we have now added some liquidity so at this point, one of alcxAmount or ethAmount should be zero
        // so we update to see whats left that we still need to add for liquidity
        alcxAmount -= alcxAdded;
        ethAmount -= ethAdded;
      }
      // we need to know the reserves to know the price and the swap we need to do for eth/alcx
      (uint256 ethReserve, uint256 alcxReserve) =
        SushiSwapLibrary.getReserves(
          sushiFactory,
          address(weth),
          address(alcx)
        );
      // now we can try to swap the right amounts [assuming one of them should be zero or close to zero]
      uint256 amountToSwap;
      // if we have more eth to swap, then calculate and swap weth for alcx
      if (alcxAmount < ethAmount) {
        ethAmount -= (amountToSwap = calculateSwapInAmount(
          ethReserve,
          ethAmount
        ));
        alcxAmount += swapExactIn(
          amountToSwap,
          0,
          getPath(address(weth), address(alcx))
        );
        // if we have alcx to swap, then swap alcx for weth
      } else if (0 < alcxAmount) {
        alcxAmount -= (amountToSwap = calculateSwapInAmount(
          alcxReserve,
          alcxAmount
        ));
        ethAmount += swapExactIn(
          amountToSwap,
          0,
          getPath(address(alcx), address(weth))
        );
      }
      // we should now have the balanced amount for adding liquidity, so we add liquidity
      // if we somehow added liquidity in perfect balance at the first stage then amountToSwap will be 0
      // and so we wont have to add liquidity if amountToSwap is zero
      if (0 < amountToSwap) {
        // we got more lp back so update accounting
        (, , uint256 moreLp) = addLiquidity(ethAmount, alcxAmount, 0, 0);
        // add to lp amount since that is in outer scope
        lpAmount += moreLp;
      }
      // add to total LP we have
      totalLp += lpAmount;
    }
    // now that we have added liquidity, we have more LP tokens which can be staked with masterchefv2
    uint256 lpBalance = IERC20(ethAlcxSLP).balanceOf(address(this));
    // increase allowance so masterchef can take the LP and start giving us tokens in sushi and alcx
    IERC20(ethAlcxSLP).ondoSafeIncreaseAllowance(
      address(masterChefV2),
      lpBalance
    );
    // finally deposit into masterchef
    masterChefV2.deposit(lpPoolId, lpBalance, address(this));
  }

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
    _compound();
    {
      uint256 lpTokens =
        vault_.shares == totalShares
          ? totalLp
          : (totalLp * vault_.shares) / totalShares;
      totalLp -= lpTokens;
      totalShares -= vault_.shares;
      vault_.shares = 0;
      masterChefV2.withdraw(lpPoolId, lpTokens, address(this));
      IERC20(ethAlcxSLP).ondoSafeIncreaseAllowance(
        address(sushiRouter),
        lpTokens
      );
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

  function getPath(address _token0, address _token1)
    internal
    pure
    returns (address[] memory path)
  {
    path = new address[](2);
    path[0] = _token0;
    path[1] = _token1;
  }

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
