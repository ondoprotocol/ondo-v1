// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IStakingRewardsFactory {
  // info about rewards for a particular staking token
  struct StakingRewardsInfo {
    address stakingRewards;
    uint256 rewardAmount;
    uint256 duration;
  }

  function stakingRewardsInfoByStakingToken(address _lpToken)
    external
    view
    returns (IStakingRewardsFactory.StakingRewardsInfo memory);
}
