pragma solidity 0.8.3;

import "contracts/strategies/AUniswapStrategy.sol";
import "contracts/vendor/dopex/IStakingRewards.sol";
import "contracts/libraries/OndoLibrary.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DopexStrategy is AUniswapStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  string public constant name = "Ondo UniswapV2 DPX/WETH Strategy";
  uint256 public totalLP;

  IStakingRewards public immutable stakingContract;
  IERC20 public immutable dpx;
  IERC20 public immutable rdpx;
  IERC20 public immutable weth;
  IERC20 public immutable lpToken;
  bool public immutable isDpxPair;

  constructor(
    address _registry,
    address _router,
    address _factory,
    address _staking,
    address _dpx,
    address _rdpx,
    address _weth,
    address _lpToken,
    bool _isDpxPair
  ) AUniswapStrategy(_registry, _router, _factory, 0) {
    // AMM 0 stands for uniswap
    require(_staking != address(0), "staking address cannot be zero");
    require(_dpx != address(0), "dpx cannot be zero");
    require(_weth != address(0), "weth cannot be zero");
    require(_lpToken != address(0), "_lpToken cannot be zero");

    stakingContract = IStakingRewards(_staking);
    dpx = IERC20(_dpx);
    rdpx = IERC20(_rdpx);
    weth = IERC20(_weth);
    lpToken = IERC20(_lpToken);
    isDpxPair = _isDpxPair;
  }

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

    depositIntoStaking(lpTokens);
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
    // TODO add compund here so all rewards are claimed

    // withdraw from stakingContract
    withdrawFromStaking(totalLP);
    (seniorReceived, juniorReceived) = _redeem(
      _vaultId,
      totalLP,
      _seniorExpected,
      _seniorMinReceived,
      _juniorMinReceived
    );
  }

  function depositIntoStaking(uint256 _amount) internal {
    require(_amount > 0, "amount must be greater than 0");
    // increase allowance for our lp tokens
    lpToken.ondoSafeIncreaseAllowance(address(stakingContract), _amount);
    stakingContract.stake(_amount);
    totalLP = totalLP + _amount;
  }

  function withdrawFromStaking(uint256 _amount) internal {
    require(_amount > 0, "totalLP must be greater than 0");
    stakingContract.withdraw(_amount);
    totalLP -= _amount;
  }

  /**
   * @notice Deposit more LP tokens while Vault is invested
   */
  function addLp(uint256 _vaultId, uint256 _amount)
    external
    virtual
    override
    whenNotPaused
    onlyOrigin(_vaultId)
  {
    Vault storage vault_ = vaults[_vaultId];
    depositIntoStaking(_amount);
    vault_.shares += _amount;
  }

  /**
   * @notice Remove LP tokens while Vault is invested
   */
  function removeLp(
    uint256 _vaultId,
    uint256 _amount,
    address to
  ) external virtual override whenNotPaused onlyOrigin(_vaultId) {
    Vault storage vault_ = vaults[_vaultId];
    withdrawFromStaking(_amount);
    IERC20(vault_.pool).safeTransfer(to, _amount);
    vault_.shares -= _amount;
    totalLP -= _amount;
  }

  // TODO expect minimum harvest
  function harvest(uint256 _minLp)
    external
    nonReentrant
    whenNotPaused
    isAuthorized(OLib.STRATEGIST_ROLE)
  {
    // get both harvested tokens
    stakingContract.getReward(2);
    uint256 dpxAmount = dpx.balanceOf(address(this));
    uint256 rdpxAmount = rdpx.balanceOf(address(this));

    uint256 wethAmount;
    uint256 lpTokens = 0;
    if (isDpxPair) {
      if (rdpxAmount > 10000) {
        // sell rdpx for weth
        wethAmount += sellAForB(address(rdpx), address(weth), rdpxAmount);
      }
      // if we have both assets, we can add liquidity
      (, , lpTokens) = investAandB(
        address(weth),
        address(dpx),
        wethAmount,
        dpxAmount
      );
    } else {
      if (dpxAmount > 10000) {
        // sell dpx for weth
        wethAmount += sellAForB(address(dpx), address(weth), dpxAmount);
      }
      (, , lpTokens) = investAandB(
        address(weth),
        address(rdpx),
        wethAmount,
        rdpxAmount
      );
    }
    if (lpTokens > 0) {
      // we have more LP now so time to invest that in staking contract

      // stake new LP tokens
      depositIntoStaking(lpTokens);
    }
    require(lpTokens >= _minLp, "Exceeds maximum slippage");
  }
}
