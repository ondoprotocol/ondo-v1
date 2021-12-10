pragma solidity 0.8.3;

abstract contract MockStaking {
  function deposit(address tokenAddress, uint256 amount) external virtual;

  function withdraw(address tokenAddress, uint256 amount) external virtual;

  function emergencyWithdraw(address tokenAddress) external virtual;

  function getCurrentEpoch() external view virtual returns (uint128);
}
