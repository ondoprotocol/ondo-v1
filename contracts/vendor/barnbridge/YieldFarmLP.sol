pragma solidity 0.8.3;

interface YieldFarmLp {
  function massHarvest() external returns (uint256);

  function harvest(uint128 epochId) external returns (uint256);
}
