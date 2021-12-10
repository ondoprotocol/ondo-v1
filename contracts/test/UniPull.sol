// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0 <0.9.0;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/vendor/uniswap/UniswapV2Library.sol";

contract UniPull {
  address public immutable uniFactory;

  constructor(address _factory) {
    uniFactory = _factory;
  }

  function migrate0(
    address _pool,
    uint256 amount0Out,
    uint256 amount1Out
  ) external {
    IUniswapV2Pair pool = IUniswapV2Pair(_pool);
    (uint256 reserve0, uint256 reserve1, ) = pool.getReserves();
    uint256 k_0 = reserve0 * reserve1 * 1000**2;
    uint256 k_1 = 997**2 * (reserve0 - amount0Out) * (reserve1 - amount1Out);
    uint256 k_diff = k_0 - k_1;
    uint256 lpWithdraw = (k_diff * pool.totalSupply()) / k_0;

    pool.transfer(address(pool), lpWithdraw);
    pool.burn(address(pool));
    pool.swap(amount0Out, amount1Out, msg.sender, "");
  }

  function migrate1(
    address _pool,
    uint256 amount0Out,
    uint256 amount1Out
  ) external {
    IUniswapV2Pair pool = IUniswapV2Pair(_pool);
    (uint256 reserve0, uint256 reserve1, ) = pool.getReserves();
    uint256 k_0 = reserve0 * reserve1 * 1000**2;
    uint256 k_1 = 997**2 * (reserve0 - amount0Out) * (reserve1 - amount1Out);
    uint256 k_diff = k_0 - k_1;
    uint256 lpWithdraw = ((k_diff * pool.totalSupply()) / k_0) - 1;
    pool.transfer(address(pool), lpWithdraw);
    pool.burn(address(pool));
    pool.swap(amount0Out, amount1Out, msg.sender, "");
  }

  function migrate2(
    address _pool,
    uint256 amount0Out,
    uint256 amount1Out
  ) external {
    IUniswapV2Pair pool = IUniswapV2Pair(_pool);
    IERC20 token0 = IERC20(pool.token0());

    IERC20 token1 = IERC20(pool.token1());

    (uint256 reserve0, uint256 reserve1, ) = pool.getReserves();
    uint256 k_0 = reserve0 * reserve1 * 1000**2;
    uint256 k_1 =
      (1000 * reserve0 - 1003 * amount0Out) *
        (1000 * reserve1 - 10003 * amount1Out);
    uint256 k_diff = k_0 - k_1;
    uint256 lpWithdraw = ((k_diff * pool.totalSupply()) / k_0);
    pool.transfer(address(pool), lpWithdraw);
    pool.burn(address(this));
    uint256 b0 = token0.balanceOf(address(this));
    uint256 b1 = token1.balanceOf(address(this));
    token0.transfer(_pool, b0);
    token1.transfer(_pool, b1);
    pool.swap(amount0Out, amount1Out, msg.sender, "");
  }
}
