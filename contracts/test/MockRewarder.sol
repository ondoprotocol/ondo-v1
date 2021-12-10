pragma solidity 0.8.3;

import "contracts/vendor/sushiswap/IRewarder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockRewarder is IRewarder {
  IERC20 public reward;

  //   constructor(address _reward) {
  //     reward = IERC20(_reward);
  //   }

  function setReward(address _reward) external {
    reward = IERC20(_reward);
  }

  function onSushiReward(
    uint256 pid,
    address user,
    address recipient,
    uint256 sushiAmount,
    uint256 newLpAmount
  ) external override {
    reward.transfer(recipient, sushiAmount * 1000);
  }

  function pendingTokens(
    uint256 pid,
    address user,
    uint256 sushiAmount
  )
    public
    view
    override
    returns (IERC20[] memory token, uint256[] memory amount)
  {
    amount = new uint256[](1);
    token = new IERC20[](1);
    amount[0] = sushiAmount * 1000;
    token[0] = reward;
  }
}
