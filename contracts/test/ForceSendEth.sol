// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0 <0.9.0;

contract ForceSendDestroy {
  function destroy(address payable to) external payable {
    selfdestruct(to);
  }
}

// for tests where we impersonate a contract
// and need to have eth
contract ForceSend {
  function forceSend(address payable to) external payable {
    ForceSendDestroy force = new ForceSendDestroy();
    force.destroy{value: msg.value}(to);
  }
}
