pragma solidity 0.8.3;

import "contracts/interfaces/IUserTriggeredReward.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestRewardHelper is IUserTriggeredReward {
  uint256 public totalDeposited;
  IERC20 public reward;

  function set(address _reward) external {
    reward = IERC20(_reward);
  }

  function invest(uint256 _amount) external override {
    totalDeposited += _amount;
  }

  function withdraw() external override {
    reward.transfer(msg.sender, reward.balanceOf(address(this)));
    totalDeposited = 0;
  }
}
