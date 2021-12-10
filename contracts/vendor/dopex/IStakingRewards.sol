pragma solidity 0.8.3;

interface IStakingRewards {
  function getReward(uint256 rewardsTokenID) external;

  function withdraw(uint256 amount) external;

  function stake(uint256 amount) external;

  function exit() external;
}
