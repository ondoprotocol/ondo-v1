// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./Ondo.sol";

/*
 * @title Staking contract based heavily on MasterChef & V2
 *
 */
contract StakingPools is AccessControl {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  // Info of each user.
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
    //
    // We do some fancy math here. Basically, any point in time, the amount of ONDOs
    // entitled to a user but is pending to be distributed is:
    //
    //   pending reward = (user.amount * pool.accOndoPerShare) - user.rewardDebt
    //
    // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
    //   1. The pool's `accOndoPerShare` (and `lastRewardBlock`) gets updated.
    //   2. User receives the pending reward sent to his/her address.
    //   3. User's `amount` gets updated.
    //   4. User's `rewardDebt` gets updated.
  }
  // Info of each pool.
  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. ONDOs to distribute per block.
    uint256 lastRewardBlock; // Last block number that ONDOs distribution occurs.
    uint256 accOndoPerShare; // Accumulated ONDOs per share, times 1e18. See below.
  }
  // The ONDO TOKEN!
  Ondo public ondo;
  // Block number when bonus ONDO period ends.
  uint256 public bonusEndBlock;
  // ONDO tokens created per block.
  uint256 public ondoPerBlock;
  // Bonus muliplier for early ondo makers.
  uint256 public constant BONUS_MULTIPLIER = 10;
  // Info of each pool.
  PoolInfo[] public poolInfo;
  // Info of each user that stakes LP tokens.
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;
  // Total allocation poitns. Must be the sum of all allocation points in all pools.
  uint256 public totalAllocPoint = 0;
  // The block number when ONDO mining starts.
  uint256 public startBlock;
  // The role for vault
  bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
  // minimum required balance for this contract
  uint256 public minimumRequiredOndoBalance;

  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event EmergencyWithdraw(
    address indexed user,
    uint256 indexed pid,
    uint256 amount
  );

  /// @notice modifier to check for authorization, this is available in OZ:4.1, current version is OZ:4.0
  modifier onlyRole(bytes32 _role) {
    require(hasRole(_role, msg.sender), "Unauthorized: Invalid role");
    _;
  }

  constructor(
    address _governance,
    Ondo _ondo,
    uint256 _ondoPerBlock,
    uint256 _startBlock,
    uint256 _bonusEndBlock
  ) {
    require(address(_ondo) != address(0), "Invalid target");
    ondo = _ondo;
    ondoPerBlock = _ondoPerBlock;
    bonusEndBlock = _bonusEndBlock;
    startBlock = _startBlock;
    _setupRole(DEFAULT_ADMIN_ROLE, _governance);
    _setupRole(MANAGER_ROLE, _governance);
  }

  function poolLength() external view returns (uint256) {
    return poolInfo.length;
  }

  // Add a new lp to the pool. Can only be called by the owner.
  // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
  function add(
    uint256 _allocPoint,
    IERC20 _lpToken,
    bool _withUpdate
  ) public onlyRole(MANAGER_ROLE) {
    if (_withUpdate) {
      massUpdatePools();
    }
    uint256 lastRewardBlock =
      block.number > startBlock ? block.number : startBlock;
    totalAllocPoint = totalAllocPoint.add(_allocPoint);
    poolInfo.push(
      PoolInfo({
        lpToken: _lpToken,
        allocPoint: _allocPoint,
        lastRewardBlock: lastRewardBlock,
        accOndoPerShare: 0
      })
    );
  }

  // Update the given pool's ONDO allocation point. Can only be called by the owner.
  function set(
    uint256 _pid,
    uint256 _allocPoint,
    bool _withUpdate
  ) public onlyRole(MANAGER_ROLE) {
    if (_withUpdate) {
      massUpdatePools();
    }
    totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
      _allocPoint
    );
    poolInfo[_pid].allocPoint = _allocPoint;
  }

  // Return reward multiplier over the given _from to _to block.
  function getMultiplier(uint256 _from, uint256 _to)
    public
    view
    returns (uint256)
  {
    if (_to <= bonusEndBlock) {
      return _to.sub(_from).mul(BONUS_MULTIPLIER);
    } else if (_from >= bonusEndBlock) {
      return _to.sub(_from);
    } else {
      return
        bonusEndBlock.sub(_from).mul(BONUS_MULTIPLIER).add(
          _to.sub(bonusEndBlock)
        );
    }
  }

  // View function to see pending ONDOs on frontend.
  function pendingOndo(uint256 _pid, address _user)
    external
    view
    returns (uint256)
  {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    uint256 accOndoPerShare = pool.accOndoPerShare;
    uint256 lpSupply = pool.lpToken.balanceOf(address(this));
    if (block.number > pool.lastRewardBlock && lpSupply != 0) {
      uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
      uint256 ondoReward =
        multiplier.mul(ondoPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
      accOndoPerShare = accOndoPerShare.add(ondoReward.mul(1e18).div(lpSupply));
    }
    return user.amount.mul(accOndoPerShare).div(1e18).sub(user.rewardDebt);
  }

  // Update reward variables for all pools. Be careful of gas spending!
  function massUpdatePools() public {
    uint256 length = poolInfo.length;
    uint256 totalRewardTokens = 0;
    for (uint256 pid = 0; pid < length; ++pid) {
      totalRewardTokens += updatePool(pid);
    }
    require(
      ondo.balanceOf(address(this)) >= totalRewardTokens,
      "Not enough ONDO for all pools."
    );
  }

  // Update reward variables of the given pool to be up-to-date.
  function updatePool(uint256 _pid) public returns (uint256) {
    PoolInfo storage pool = poolInfo[_pid];
    if (block.number <= pool.lastRewardBlock) {
      return 0;
    }
    uint256 lpSupply = pool.lpToken.balanceOf(address(this));
    if (lpSupply == 0) {
      pool.lastRewardBlock = block.number;
      return 0;
    }
    uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
    uint256 ondoReward =
      multiplier.mul(ondoPerBlock).mul(pool.allocPoint).div(totalAllocPoint);

    minimumRequiredOndoBalance += ondoReward;

    require(
      ondo.balanceOf(address(this)) >= minimumRequiredOndoBalance,
      "Not enough ONDO for Staking contract"
    );

    pool.accOndoPerShare = pool.accOndoPerShare.add(
      ondoReward.mul(1e18).div(lpSupply)
    );
    pool.lastRewardBlock = block.number;
    return ondoReward;
  }

  // Deposit LP tokens to StakingPool for ONDO allocation.
  function deposit(uint256 _pid, uint256 _amount) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    updatePool(_pid);
    if (user.amount > 0) {
      uint256 pending =
        user.amount.mul(pool.accOndoPerShare).div(1e18).sub(user.rewardDebt);
      safeOndoTransfer(msg.sender, pending);
    }
    pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
    user.amount = user.amount.add(_amount);
    user.rewardDebt = user.amount.mul(pool.accOndoPerShare).div(1e18);
    emit Deposit(msg.sender, _pid, _amount);
  }

  // Withdraw LP tokens from StakingPool.
  function withdraw(uint256 _pid, uint256 _amount) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    require(user.amount >= _amount, "withdraw: not good");
    updatePool(_pid);
    uint256 pending =
      user.amount.mul(pool.accOndoPerShare).div(1e18).sub(user.rewardDebt);
    safeOndoTransfer(msg.sender, pending);
    user.amount = user.amount.sub(_amount);
    user.rewardDebt = user.amount.mul(pool.accOndoPerShare).div(1e18);
    pool.lpToken.safeTransfer(address(msg.sender), _amount);
    emit Withdraw(msg.sender, _pid, _amount);
  }

  // Withdraw without caring about rewards. EMERGENCY ONLY.
  function emergencyWithdraw(uint256 _pid) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    pool.lpToken.safeTransfer(address(msg.sender), user.amount);
    emit EmergencyWithdraw(msg.sender, _pid, user.amount);
    user.amount = 0;
    user.rewardDebt = 0;
  }

  // Safe ondo transfer function, just in case if rounding error causes pool to not have enough ONDOs.
  function safeOndoTransfer(address _to, uint256 _amount) internal {
    uint256 ondoBal = ondo.balanceOf(address(this));
    if (_amount > ondoBal) {
      ondo.transfer(_to, ondoBal);
      minimumRequiredOndoBalance -= ondoBal;
    } else {
      ondo.transfer(_to, _amount);
      minimumRequiredOndoBalance -= _amount;
    }
  }
}
