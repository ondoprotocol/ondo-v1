pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDragonLair is IERC20 {
  function enter(uint256 _amount) external;

  // Leave the Lair. Claim back your QUICKs.
  // Unlocks the staked + gained QUICK and burns dQUICK
  function leave(uint256 _amount) external;
}
