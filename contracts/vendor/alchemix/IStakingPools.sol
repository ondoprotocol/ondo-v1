pragma solidity 0.8.3;

interface IStakingPools {
  function deposit(uint256 id, uint256 amount) external;

  function claim(uint256 id) external;

  function withdraw(uint256 id, uint256 amount) external;

  function exit(uint256 id) external;

  function getStakeTotalRewards(address _account, uint256 _poolId)
    external
    returns (uint256);
}
