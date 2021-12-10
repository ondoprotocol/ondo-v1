pragma solidity 0.8.3;

interface Staking {
  function balanceOf(address user, address token)
    external
    view
    returns (uint256);

  function deposit(address tokenAddress, uint256 amount) external;

  function withdraw(address tokenAddress, uint256 amount) external;
}
