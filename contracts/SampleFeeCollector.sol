// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/OndoRegistryClient.sol";
import "contracts/interfaces/IFeeCollector.sol";
import "contracts/interfaces/IPairVault.sol";
import {OndoSaferERC20} from "contracts/libraries/OndoLibrary.sol";

/*
 * @title Sample Fee Collector
 * @notice Send all fee directly to creator
 */
contract SampleFeeCollector is OndoRegistryClient, IFeeCollector {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  IPairVault public immutable vaultManager;

  event ProcessFee(address indexed strategist, IERC20 token, uint256 fee);

  constructor(address vault, address registryAddress)
    OndoRegistryClient(registryAddress)
  {
    require(
      registry.authorized(OLib.VAULT_ROLE, vault),
      "Not a registered Vault"
    );
    vaultManager = IPairVault(vault);
  }

  /*
   * @notice Example of how to distribute fees to people
   * @param vaultId If you need more info, use this to query contract
   * @param strategist The strategist account for this vault
   * @param token The ERC20 token for junior tranche with which payment is made
   * @param fee The amount of token sent to this contract
   */
  function processFee(
    uint256 vaultId,
    IERC20 token,
    uint256 fee
  ) external override nonReentrant isAuthorized(OLib.VAULT_ROLE) {
    require(vaultId != 0, "Invalid Vault id");
    require(address(token) != address(0), "Invalid address for token");
    if (fee > 0) {
      IPairVault.VaultView memory vaultInfo =
        vaultManager.getVaultById(vaultId);
      address creator = vaultInfo.creator;
      token.safeTransfer(creator, fee);
      require(
        token.balanceOf(address(this)) == 0,
        "SampleFeeCollector should not hold tokens."
      );
      emit ProcessFee(creator, token, fee);
    }
  }
}
