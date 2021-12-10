pragma solidity 0.8.3;

interface IUserTriggeredReward {
  function invest(uint256 _amount) external;

  function withdraw() external;
}
