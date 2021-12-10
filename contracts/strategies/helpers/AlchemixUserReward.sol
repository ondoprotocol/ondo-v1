pragma solidity 0.8.3;

import "contracts/vendor/alchemix/IStakingPools.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/libraries/OndoLibrary.sol";
import "contracts/interfaces/IUserTriggeredReward.sol";

contract AlchemixUserReward is IUserTriggeredReward {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  IStakingPools public stakingPools;
  IERC20 public alcx;
  uint256 public alcxPoolId;
  address public strategy;

  constructor(
    address _pool,
    address _alcx,
    address _strategy,
    uint256 _id
  ) {
    stakingPools = IStakingPools(_pool);
    alcx = IERC20(_alcx);
    strategy = _strategy;
    alcxPoolId = _id;
  }

  function invest(uint256 _amount) external override {
    require(msg.sender == strategy, "Invalid caller");
    alcx.ondoSafeIncreaseAllowance(address(stakingPools), _amount);
    stakingPools.deposit(alcxPoolId, _amount);
  }

  function withdraw() external override {
    require(msg.sender == strategy, "Invalid caller");
    stakingPools.exit(alcxPoolId);
    alcx.transfer(strategy, alcx.balanceOf(address(this)));
  }
}
