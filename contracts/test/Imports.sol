// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0 <0.9.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

// dumb hack so truffle builds things we want to use in
// migrations and tests
contract Imports {
  function ierc20(IERC20 ierc20p) external {}

  function iunipair(IUniswapV2Pair _a) external {}

  function ifactory(IUniswapV2Factory _a) external {}
}
