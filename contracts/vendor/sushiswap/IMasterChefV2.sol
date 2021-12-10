// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IRewarder.sol";

interface IMasterChefV2 {
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
  }

  struct PoolInfo {
    uint256 allocPoint; // How many allocation points assigned to this pool. SUSHI to distribute per block.
    uint256 lastRewardBlock; // Last block number that SUSHI distribution occurs.
    uint256 accSushiPerShare; // Accumulated SUSHI per share, times 1e12. See below.
  }

  function poolInfo(uint256 pid)
    external
    view
    returns (IMasterChefV2.PoolInfo memory);

  function lpToken(uint256 pid) external view returns (address);

  function poolLength() external view returns (uint256 pools);

  function totalAllocPoint() external view returns (uint256);

  function sushiPerBlock() external view returns (uint256);

  function deposit(
    uint256 _pid,
    uint256 _amount,
    address _to
  ) external;

  function withdraw(
    uint256 _pid,
    uint256 _amount,
    address _to
  ) external;

  function withdrawAndHarvest(
    uint256 _pid,
    uint256 _amount,
    address _to
  ) external;

  function harvest(uint256 _pid, address _to) external;

  function userInfo(uint256 _pid, address _user)
    external
    view
    returns (uint256 amount, uint256 rewardDebt);

  /**
   * @dev for testing purposes via impersonateAccount
   * TODO: Does this need to be here? Remove it?
   */
  function owner() external view returns (address);

  function add(
    uint256 _allocPoint,
    IERC20 _lpToken,
    IRewarder _rewarder
  ) external;

  function set(
    uint256 _pid,
    uint256 _allocPoint,
    IRewarder _rewarder,
    bool _overwrite
  ) external;

  function emergencyWithdraw(uint256 pid, address to) external;
}
