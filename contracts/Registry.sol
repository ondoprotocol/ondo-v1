// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "contracts/interfaces/ITrancheToken.sol";
import "contracts/interfaces/IRegistry.sol";
import "contracts/libraries/OndoLibrary.sol";
import "contracts/interfaces/IWETH.sol";

/**
 * @title Global values used by many contracts
 * @notice This is mostly used for access control
 */
contract Registry is IRegistry, AccessControl {
  using EnumerableSet for EnumerableSet.AddressSet;
  bool private _paused;
  bool public override tokenMinting;

  uint256 public constant override denominator = 10000;

  IWETH public immutable override weth;

  EnumerableSet.AddressSet private deadTokens;
  address payable public fallbackRecipient;

  mapping(address => string) public strategistNames;

  modifier onlyRole(bytes32 _role) {
    require(hasRole(_role, msg.sender), "Unauthorized: Invalid role");
    _;
  }

  constructor(
    address _governance,
    address payable _fallbackRecipient,
    address _weth
  ) {
    require(
      _fallbackRecipient != address(0) && _fallbackRecipient != address(this),
      "Invalid address"
    );
    _setupRole(DEFAULT_ADMIN_ROLE, _governance);
    _setupRole(OLib.GOVERNANCE_ROLE, _governance);
    _setRoleAdmin(OLib.VAULT_ROLE, OLib.DEPLOYER_ROLE);
    _setRoleAdmin(OLib.ROLLOVER_ROLE, OLib.DEPLOYER_ROLE);
    _setRoleAdmin(OLib.STRATEGY_ROLE, OLib.DEPLOYER_ROLE);
    fallbackRecipient = _fallbackRecipient;
    weth = IWETH(_weth);
  }

  /**
   * @notice General ACL check
   * @param _role One of the predefined roles
   * @param _account Address to check
   * @return Access/Denied
   */
  function authorized(bytes32 _role, address _account)
    public
    view
    override
    returns (bool)
  {
    return hasRole(_role, _account);
  }

  /**
   * @notice Add a new official strategist
   * @dev grantRole protects this ACL
   * @param _strategist Address of new strategist
   * @param _name Display name for UI
   */
  function addStrategist(address _strategist, string calldata _name) external {
    grantRole(OLib.STRATEGIST_ROLE, _strategist);
    strategistNames[_strategist] = _name;
  }

  function enableTokens() external override onlyRole(OLib.GOVERNANCE_ROLE) {
    tokenMinting = true;
  }

  function disableTokens() external override onlyRole(OLib.GOVERNANCE_ROLE) {
    tokenMinting = false;
  }

  /**
   * @dev Emitted when the pause is triggered by `account`.
   */
  event Paused(address account);

  /**
   * @dev Emitted when the pause is lifted by `account`.
   */
  event Unpaused(address account);

  /*
   * @notice Helper to expose a Pausable interface to tools
   */
  function paused() public view override returns (bool) {
    return _paused;
  }

  /**
   * @notice Turn on paused variable. Everything stops!
   */
  function pause() external override onlyRole(OLib.PANIC_ROLE) {
    _paused = true;
    emit Paused(msg.sender);
  }

  /**
   * @notice Turn off paused variable. Everything resumes.
   */
  function unpause() external override onlyRole(OLib.GUARDIAN_ROLE) {
    _paused = false;
    emit Unpaused(msg.sender);
  }

  /**
   * @notice Manually determine which TrancheToken instances can be recycled
   * @dev Move into another list where createVault can delete to save gas. Done manually for safety.
   * @param _tokens List of tokens
   */
  function tokensDeclaredDead(address[] calldata _tokens)
    external
    onlyRole(OLib.GUARDIAN_ROLE)
  {
    for (uint256 i = 0; i < _tokens.length; i++) {
      deadTokens.add(_tokens[i]);
    }
  }

  /**
   * @notice Called by createVault to delete a few dead contracts
   * @param _tranches Number of tranches (really, number of contracts to delete)
   */
  function recycleDeadTokens(uint256 _tranches)
    external
    override
    onlyRole(OLib.VAULT_ROLE)
  {
    uint256 toRecycle =
      deadTokens.length() >= _tranches ? _tranches : deadTokens.length();
    while (toRecycle > 0) {
      address last = deadTokens.at(deadTokens.length() - 1);
      try ITrancheToken(last).destroy(fallbackRecipient) {} catch {}
      deadTokens.remove(last);
      toRecycle -= 1;
    }
  }

  /**
   * @notice Who will get any random eth from dead tranchetokens
   * @param _target Receipient of ETH
   */
  function setFallbackRecipient(address payable _target)
    external
    onlyRole(OLib.GOVERNANCE_ROLE)
  {
    fallbackRecipient = _target;
  }
}
