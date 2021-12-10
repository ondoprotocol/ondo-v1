// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "contracts/interfaces/ITrancheToken.sol";
import "contracts/libraries/OndoLibrary.sol";

interface IRollover {
  // ========== EVENTS ==========

  event CreatedRollover(
    uint256 indexed rolloverId,
    address indexed creator,
    address indexed strategist,
    address seniorAsset,
    address juniorAsset,
    address seniorToken,
    address juniorToken
  );

  event AddedVault(uint256 indexed rolloverId, uint256 indexed vaultId);

  event MigratedRollover(
    uint256 indexed rolloverId,
    uint256 indexed newVault,
    uint256 seniorDeposited,
    uint256 juniorDeposited
  );

  event Withdrew(
    address indexed user,
    uint256 indexed rolloverId,
    uint256 indexed trancheId,
    uint256 shares,
    uint256 excess
  );

  event Deposited(
    address indexed user,
    uint256 indexed rolloverId,
    uint256 indexed trancheId,
    uint256 depositAmount,
    int256 amountTransferredFromUser,
    uint256 sharesMinted
  );

  event Claimed(
    address indexed user,
    uint256 indexed rolloverId,
    uint256 indexed trancheId,
    uint256 tokens,
    uint256 excess
  );

  // ========== STRUCTS ==========

  struct TrancheRoundView {
    uint256 deposited;
    uint256 invested; // Total, if any, actually invested
    uint256 redeemed; // After Vault is done, total tokens redeemed for LP
    uint256 shares;
    uint256 newDeposited;
    uint256 newInvested;
  }

  struct RoundView {
    uint256 vaultId;
    TrancheRoundView[] tranches;
  }

  struct RolloverView {
    address creator;
    address strategist;
    IERC20[] assets;
    ITrancheToken[] rolloverTokens;
    uint256 thisRound;
  }

  struct TrancheRound {
    uint256 deposited;
    uint256 invested; // Total, if any, actually invested
    uint256 redeemed; // After Vault is done, total tokens redeemed for LP
    uint256 shares;
    uint256 newDeposited;
    uint256 newInvested;
    mapping(address => OLib.Investor) investors;
  }

  struct Round {
    uint256 vaultId;
    mapping(OLib.Tranche => TrancheRound) tranches;
  }

  struct Rollover {
    address creator;
    address strategist;
    mapping(uint256 => Round) rounds;
    mapping(OLib.Tranche => IERC20) assets;
    mapping(OLib.Tranche => ITrancheToken) rolloverTokens;
    mapping(OLib.Tranche => mapping(address => uint256)) investorLastUpdates;
    uint256 thisRound;
    bool dead;
  }

  struct SlippageSettings {
    uint256 seniorMinInvest;
    uint256 seniorMinRedeem;
    uint256 juniorMinInvest;
    uint256 juniorMinRedeem;
  }

  // ========== FUNCTIONS ==========

  function getNextVault(uint256 rolloverId) external view returns (uint256);
}
