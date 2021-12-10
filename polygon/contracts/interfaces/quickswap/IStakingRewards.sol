// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IStakingRewards {
  // Views
  function totalSupply() external view returns (uint256);

  function balanceOf(address account) external view returns (uint256);

  // Mutative
  function getReward() external;

  function stake(uint256 amount) external;

  function withdraw(uint256 amount) external;
}
