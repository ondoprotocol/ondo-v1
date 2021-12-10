pragma solidity 0.8.3;

interface IRewardsManager {
  function deposit(uint256 pid, uint256 amount) external;

  function withdraw(uint256 pid, uint256 amount) external;

  function userInfo(uint256, address) external;
}
