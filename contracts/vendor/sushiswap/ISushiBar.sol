pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISushiBar is IERC20 {
  function enter(uint256 _amount) external;

  // Leave the bar. Claim back your SUSHIs.
  // Unlocks the staked + gained Sushi and burns xSushi
  function leave(uint256 _share) external;
}
