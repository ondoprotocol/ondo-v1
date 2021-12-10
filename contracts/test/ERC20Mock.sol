// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0 <0.9.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20Mock is ERC20, Ownable {
  constructor() ERC20("Mock", "MCK") {}

  function mint(address to, uint256 amt) public onlyOwner {
    _mint(to, amt);
  }

  function burn(address from, uint256 amt) public onlyOwner {
    _burn(from, amt);
  }

  function burnApprove(address from, uint256 amt) public onlyOwner {
    uint256 allowance = allowance(from, msg.sender);
    // SafeMath by default, no asserts!
    _approve(from, msg.sender, allowance - amt);
    _burn(from, amt);
  }
}
