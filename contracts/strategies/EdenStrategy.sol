pragma solidity 0.8.3;

import "contracts/strategies/AUniswapStrategy.sol";
import "contracts/vendor/eden/IRewardsManager.sol";
import "contracts/libraries/OndoLibrary.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract EdenStrategy is AUniswapStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  string public constant name = "Ondo Sushiswap WETH/EDEN Strategy";
  // hardcoded pid 0
  uint256 public constant WETH_EDEN_REWARD_POOL_ID = 0;
  uint256 public totalLP;

  IRewardsManager public immutable rewardsManager;
  IERC20 public immutable eden;
  IERC20 public immutable weth;
  IERC20 public immutable sushi;
  IERC20 public immutable wethEdenSushiLp;

  constructor(
    address _registry,
    address _router,
    address _factory,
    address _rewardsManager,
    address _weth,
    address _eden,
    address _wethEdenSushiLp,
    address _sushi
  ) AUniswapStrategy(_registry, _router, _factory, 1) {
    // AMM 1 stands for sushiswap
    require(
      _rewardsManager != address(0),
      "rewardsManager address cannot be zero"
    );
    require(_weth != address(0), "weth cannot be zero");
    require(_eden != address(0), "eden cannot be zero");
    require(_wethEdenSushiLp != address(0), "wethedenUniLp cannot be zero");
    require(_sushi != address(0), "sushi address cannot be zero");

    rewardsManager = IRewardsManager(_rewardsManager);
    eden = IERC20(_eden);
    weth = IERC20(_weth);
    wethEdenSushiLp = IERC20(_wethEdenSushiLp);
    sushi = IERC20(_sushi);
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
    uint256 _totalLPBeforeWithdraw = totalLP;
    // withdraw from rewardsManager
    withdrawFromStaking(totalLP);
    uint256 bal2 = wethEdenSushiLp.balanceOf(address(this));
    (seniorReceived, juniorReceived) = _redeem(
      _vaultId,
      _totalLPBeforeWithdraw,
      _seniorExpected,
      _seniorMinReceived,
      _juniorMinReceived
    );
  }

  function depositIntoStaking(uint256 _amount) internal {
    require(_amount > 0, "amount must be greater than 0");
    uint256 bal = wethEdenSushiLp.balanceOf(address(this));
    wethEdenSushiLp.ondoSafeIncreaseAllowance(address(rewardsManager), _amount);
    rewardsManager.deposit(WETH_EDEN_REWARD_POOL_ID, _amount);
    totalLP = totalLP + _amount;
  }

  function withdrawFromStaking(uint256 _amount) internal {
    require(_amount > 0, "amount must be greater than 0");
    rewardsManager.withdraw(WETH_EDEN_REWARD_POOL_ID, _amount);
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
  }

  function harvest(uint256 _vaultId)
    external
    nonReentrant
    whenNotPaused
    isAuthorized(OLib.STRATEGIST_ROLE)
  {
    Vault storage vault_ = vaults[_vaultId];

    // withdraw all from staking
    withdrawFromStaking(totalLP);
    uint256 lpTokensBefore = wethEdenSushiLp.balanceOf(address(this));
    uint256 edenAmount = eden.balanceOf(address(this));
    uint256 wethAmount;

    uint256 sushiAmount = sushi.balanceOf(address(this));

    if (sushiAmount > 10000) {
      wethAmount = sellAForB(address(sushi), address(weth), sushiAmount);
    }

    // we know that eden would have increased as part of withdraw so now we need to convert the eden to balance with weth so we can provide more LP
    if (edenAmount > 10000) {
      if (wethAmount > 0) {
        /**
          This block essentially manages what to do with sushi, we only get weth if there was some sushi and currently there is no sushi
         */

        investAandB(address(weth), address(eden), wethAmount, edenAmount);
      } else {
        // add liquidity
        investB(address(weth), address(eden), wethAmount, edenAmount);
      }

      // we have more LP now so time to stake that in staking contract

      uint256 lpTokens = wethEdenSushiLp.balanceOf(address(this));
      // stake all LP tokens in eden rewardManager
      depositIntoStaking(lpTokens);
    }
  }
}
