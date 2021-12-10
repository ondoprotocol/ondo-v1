pragma solidity 0.8.3;

import "contracts/strategies/AUniswapStrategy.sol";
import "contracts/vendor/barnbridge/Staking.sol";
import "contracts/vendor/barnbridge/YieldFarmLP.sol";
import "contracts/libraries/OndoLibrary.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BondStrategy is AUniswapStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  string public constant name = "Ondo UniswapV2 BOND/USDC Strategy";
  uint256 public totalLP;

  Staking public immutable stakingContract;
  YieldFarmLp public immutable yieldFarm;
  IERC20 public immutable bond;
  IERC20 public immutable usdc;
  IERC20 public immutable usdcBondUniLp;

  constructor(
    address _registry,
    address _router,
    address _factory,
    address _staking,
    address _yieldFarm,
    address _usdc,
    address _bond,
    address _usdcBondUniLp
  ) AUniswapStrategy(_registry, _router, _factory, 0) {
    // AMM 0 stands for uniswap
    require(_staking != address(0), "staking address cannot be zero");
    require(_yieldFarm != address(0), "yieldfarm cannot be zero");
    require(_bond != address(0), "bond cannot be zero");
    require(_usdc != address(0), "usdc cannot be zero");
    require(_usdcBondUniLp != address(0), "usdcBondUniLp cannot be zero");

    stakingContract = Staking(_staking);
    yieldFarm = YieldFarmLp(_yieldFarm);
    bond = IERC20(_bond);
    usdc = IERC20(_usdc);
    usdcBondUniLp = IERC20(_usdcBondUniLp);
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
    // withdraw from stakingContract
    uint256 totalLPBefore = totalLP;
    withdrawFromStaking(totalLP);
    (seniorReceived, juniorReceived) = _redeem(
      _vaultId,
      totalLPBefore,
      _seniorExpected,
      _seniorMinReceived,
      _juniorMinReceived
    );
  }

  function depositIntoStaking(uint256 _amount) internal {
    require(_amount > 0, "amount must be greater than 0");
    // increase allowance for our lp tokens
    usdcBondUniLp.ondoSafeIncreaseAllowance(address(stakingContract), _amount);
    // deposit into staking
    stakingContract.deposit(address(usdcBondUniLp), _amount);
    totalLP += _amount;
  }

  function withdrawFromStaking(uint256 _amount) internal {
    require(_amount > 0, "_amount must be greater than 0");
    stakingContract.withdraw(address(usdcBondUniLp), _amount);
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

  function harvest(uint256 _minLp)
    external
    nonReentrant
    whenNotPaused
    isAuthorized(OLib.STRATEGIST_ROLE)
  {
    uint256 bondAmountBefore = bond.balanceOf(address(this));
    // get harvested tokens for all epochs
    yieldFarm.massHarvest();
    uint256 bondAmountAfter = bond.balanceOf(address(this));
    // technically can just use balanceOf since all bond balance should be provided as LP
    uint256 bondAmount = bondAmountAfter - bondAmountBefore;
    uint256 usdcAmount;
    uint256 lpTokens = 0;
    // we know that bond would have increased as part of harvest so now we need to convert the bond to balance with usdc so we can provide more LP
    if (bondAmount > 10000) {
      // same interface for uniswap and sushiswap
      (, , lpTokens) = investB(
        address(usdc),
        address(bond),
        usdcAmount,
        bondAmount
      );
      // we have more LP now so time to invest that in staking contract
      // stake new LP tokens in bond
      depositIntoStaking(lpTokens);
    }
    require(lpTokens >= _minLp, "Exceeds maximum slippage");
  }
}
