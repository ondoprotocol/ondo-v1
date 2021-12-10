// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMasterChef {
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
  }

  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. SUSHI to distribute per block.
    uint256 lastRewardBlock; // Last block number that SUSHI distribution occurs.
    uint256 accSushiPerShare; // Accumulated SUSHI per share, times 1e12. See below.
  }

  function poolInfo(uint256 pid)
    external
    view
    returns (IMasterChef.PoolInfo memory);

  function lpToken(uint256 pid) external view returns (address);

  function poolLength() external view returns (uint256 pools);

  function totalAllocPoint() external view returns (uint256);

  function deposit(uint256 _pid, uint256 _amount) external;

  function withdraw(uint256 _pid, uint256 _amount) external;

  function userInfo(uint256 _pid, address _user)
    external
    view
    returns (UserInfo memory);

  /**
   * @dev for testing purposes via impersonateAccount
   */
  function owner() external view returns (address);

  function add(
    uint256 _allocPoint,
    IERC20 _lpToken,
    bool _withUpdate
  ) external;

  function set(
    uint256 _pid,
    uint256 _allocPoint,
    bool _withUpdate
  ) external;
}
