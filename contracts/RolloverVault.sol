// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/Arrays.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "contracts/OndoRegistryClient.sol";
import "contracts/TrancheToken.sol";
import "contracts/interfaces/IPairVault.sol";
import "contracts/interfaces/ITrancheToken.sol";
import "contracts/interfaces/IRollover.sol";
import "contracts/libraries/OndoLibrary.sol";
import "hardhat/console.sol";

/**
At a high-level, think of a Rollover as a fund that invests in a
series of fixed-duration Vault products. Customers can leave tokens in a
Rollover and let the agent move the funds periodically into another
Vault. To exit the Rollover, customers can claim tokens representing
their share of the current Vault. The Rollover will no longer manage
their funds. Instead, the customer will withdraw their funds from the
Vault directly when it expires.

As with Vaults invested in LP tokens, there must be a balance in value
between senior and junior assets. There will always be an
imbalance. To keep things fair, maintain a queue of depositors with
their amounts. When the Vault finally invests, it gives priority to all
funds from the Rollover. Then it adds in any direct investments in to
the Vault. It tries to add all of it as liquidity to the AMM. The AMM
will return how much it actually accepted. Any amount that didn't get
accepted must be credited back to the right customer accounts.

It is possible when a Rollove tries to invest all accumulated funds
into the next Vault that some funds won't get in. For example, the
junior investors could make so much they are out of balance with the
senior tranche. In this case, the excess funds are held by the
Rollover (not invested anywhere). The Rollover will attempt to invest
these exces funds in the next Vault. New investors could join the
rollover or the Vault, which could help offset the imbalance and get
more funds invested.

 */

contract RolloverVault is OndoRegistryClient, IRollover {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;
  using SafeERC20Upgradeable for ITrancheToken;
  using OLib for OLib.Investor;

  IPairVault public immutable vaultManager;
  address public immutable trancheTokenImpl;
  mapping(uint256 => Rollover) internal rollovers; // rollovers by id

  /**
   * @dev Setup contract dependencies here
   * @param _vault Pointer to AllPairsVault
   * @param _registry Pointer to Registry
   * @param _trancheTokenImpl Pointer to TrancheToken
   */
  constructor(
    address _vault,
    address _registry,
    address _trancheTokenImpl
  ) OndoRegistryClient(_registry) {
    require(
      _vault != address(0) && _trancheTokenImpl != address(0),
      "Invalid target"
    );
    require(
      registry.authorized(OLib.VAULT_ROLE, _vault),
      "Not a registered Vault"
    );
    vaultManager = IPairVault(_vault);
    trancheTokenImpl = _trancheTokenImpl;
  }

  // ========== MODIFIERS ==========

  modifier onlyStrategist(uint256 _rolloverId) {
    require(
      msg.sender == rollovers[_rolloverId].strategist,
      "Caller must be rollover strategist"
    );
    _;
  }

  modifier notDead(uint256 _rolloverId) {
    require(!rollovers[_rolloverId].dead, "Rollover is dead");
    _;
  }

  // ========== VIEW FUNCTIONS ==========

  /**
   * @notice Return info about a Rollover
   * @param _rolloverId Rollover to work on
   * @return Info about rollover instance
   */
  function getRollover(uint256 _rolloverId)
    external
    view
    returns (RolloverView memory)
  {
    Rollover storage rollover = rollovers[_rolloverId];

    IERC20[] memory assets = new IERC20[](2);
    assets[0] = rollover.assets[OLib.Tranche.Senior];
    assets[1] = rollover.assets[OLib.Tranche.Junior];

    ITrancheToken[] memory rolloverTokens = new ITrancheToken[](2);
    rolloverTokens[0] = rollover.rolloverTokens[OLib.Tranche.Senior];
    rolloverTokens[1] = rollover.rolloverTokens[OLib.Tranche.Junior];

    return
      RolloverView(
        rollover.creator,
        rollover.strategist,
        assets,
        rolloverTokens,
        rollover.thisRound
      );
  }

  /**
   * @notice Info about a specific tranche at a round
   */
  function _getTrancheRound(TrancheRound storage _trancheRound)
    internal
    view
    returns (TrancheRoundView memory)
  {
    return
      TrancheRoundView(
        _trancheRound.deposited,
        _trancheRound.invested,
        _trancheRound.redeemed,
        _trancheRound.shares,
        _trancheRound.newDeposited,
        _trancheRound.newInvested
      );
  }

  /**
   * @notice Return info about a specific round
   * @dev A "round" refers to the cycle of invest/redeem in an underlying Vault
   * @param _rolloverId Rollover
   * @param _roundIndex Counter for investment cycle
   * @return Info about a round
   */
  function getRound(uint256 _rolloverId, uint256 _roundIndex)
    external
    view
    returns (RoundView memory)
  {
    Rollover storage rollover = rollovers[_rolloverId];
    Round storage round = rollover.rounds[_roundIndex];

    TrancheRoundView[] memory trancheRounds = new TrancheRoundView[](2);
    trancheRounds[0] = _getTrancheRound(round.tranches[OLib.Tranche.Senior]);
    trancheRounds[1] = _getTrancheRound(round.tranches[OLib.Tranche.Junior]);

    return RoundView(round.vaultId, trancheRounds);
  }

  /**
   * @notice Return the Vault for the next rollover round
   * @param _rolloverId Rollover
   * @return Vault id
   */
  function getNextVault(uint256 _rolloverId)
    external
    view
    override
    returns (uint256)
  {
    Rollover storage rollover = rollovers[_rolloverId];
    uint256 vaultId = rollover.rounds[rollover.thisRound + 2].vaultId;
    require(vaultId != 0, "No next Vault yet");
    return vaultId;
  }

  function _getUpdatedInvestor(
    address _investor,
    uint256 _rolloverId,
    OLib.Tranche _tranche
  ) internal view returns (uint256, uint256) {
    Rollover storage rollover = rollovers[_rolloverId];
    uint256 lastUpdateRound = rollover.investorLastUpdates[_tranche][_investor];
    TrancheRound storage trancheround =
      rollover.rounds[lastUpdateRound].tranches[_tranche];
    OLib.Investor storage investor = trancheround.investors[_investor];
    (uint256 invested, uint256 rejected) =
      investor.getInvestedAndExcess(trancheround.newInvested);

    uint256 shares;
    if (trancheround.deposited != 0) {
      shares = (invested * trancheround.shares) / trancheround.deposited;
    }

    return (shares, rejected);
  }

  /**
   * @notice Return shares and excess in Rollover
   * @param _investor Address of investor account
   * @param _rolloverId Rollover
   * @param _tranche Tranche
   * @return shares Number of shares representing investment
   * @return excess Uninvested deposits (didn't make it into the Vault)
   */
  function getUpdatedInvestor(
    address _investor,
    uint256 _rolloverId,
    OLib.Tranche _tranche
  ) external view returns (uint256 shares, uint256 excess) {
    (shares, excess) = _getUpdatedInvestor(_investor, _rolloverId, _tranche);
  }

  // ========== MUTATIVE FUNCTIONS ==========

  /**
   * @notice Define a new rollover instance
   * @dev If _vaultId is 0, use _params for everything. Otherwise, inherit most params from _vaultId instance
   * @param _vaultId Optional Vault to inherit parameters from
   * @param _params Additional parameters
   */
  function newRollover(uint256 _vaultId, OLib.RolloverParams memory _params)
    external
    whenNotPaused
    isAuthorized(OLib.CREATOR_ROLE)
  {
    require(_vaultId != 0, "Invalid vaultId");

    IPairVault.VaultView memory vault = vaultManager.getVaultById(_vaultId);
    require(vault.startAt >= block.timestamp, "Invalid start time");

    uint256 rolloverId =
      uint256(
        keccak256(
          abi.encode(
            address(vault.assets[0].token),
            address(vault.assets[1].token),
            address(vault.strategy),
            vault.startAt
          )
        )
      );

    Rollover storage rollover = rollovers[rolloverId];
    require(rollover.rounds[1].vaultId == 0, "Already exists");

    rollover.creator = msg.sender;
    rollover.strategist = _params.strategist;
    rollover.assets[OLib.Tranche.Senior] = IERC20(vault.assets[0].token);
    rollover.assets[OLib.Tranche.Junior] = IERC20(vault.assets[1].token);
    rollover.rounds[1].vaultId = _vaultId;

    TrancheToken srTrancheToken =
      TrancheToken(
        Clones.cloneDeterministic(
          trancheTokenImpl,
          keccak256(abi.encodePacked(uint8(0), rolloverId))
        )
      );
    TrancheToken jrTrancheToken =
      TrancheToken(
        Clones.cloneDeterministic(
          trancheTokenImpl,
          keccak256(abi.encodePacked(uint8(1), rolloverId))
        )
      );
    srTrancheToken.initialize(
      rolloverId,
      _params.seniorName,
      _params.seniorSym,
      address(vaultManager)
    );
    jrTrancheToken.initialize(
      rolloverId,
      _params.juniorName,
      _params.juniorSym,
      address(vaultManager)
    );
    rollover.rolloverTokens[OLib.Tranche.Senior] = srTrancheToken;
    rollover.rolloverTokens[OLib.Tranche.Junior] = jrTrancheToken;

    vaultManager.setRollover(_vaultId, address(this), rolloverId);

    emit CreatedRollover(
      rolloverId,
      msg.sender,
      _params.strategist,
      address(vault.assets[0].token),
      address(vault.assets[1].token),
      address(srTrancheToken),
      address(jrTrancheToken)
    );
  }

  /**
   * @notice Set Rollover to invest in an existing Vault next round
   * @dev Make sure the next Vault uses the same assets.
   * @param _rolloverId Rollover
   * @param _vaultId Vault
   */
  function addNextVault(uint256 _rolloverId, uint256 _vaultId)
    external
    whenNotPaused
    notDead(_rolloverId)
    isAuthorized(OLib.CREATOR_ROLE)
    nonReentrant
  {
    Rollover storage rollover = rollovers[_rolloverId];
    IPairVault.VaultView memory vault = vaultManager.getVaultById(_vaultId);
    require(
      vault.assets[0].token == rollover.assets[OLib.Tranche.Senior] &&
        vault.assets[1].token == rollover.assets[OLib.Tranche.Junior],
      "Tranche assets do not match"
    );
    require(
      rollover.rounds[rollover.thisRound + 2].vaultId == 0,
      "Round Vault already set"
    );

    IPairVault.VaultView memory prev =
      vaultManager.getVaultById(
        rollover.rounds[rollover.thisRound + 1].vaultId
      );

    require(
      vault.investAt == prev.redeemAt,
      "Rollover migration must be atomic"
    );

    vaultManager.setRollover(_vaultId, address(this), _rolloverId);
    rollover.rounds[rollover.thisRound + 2].vaultId = _vaultId;

    emit AddedVault(_rolloverId, _vaultId);
  }

  /**
   * @notice Deposit tokens into a queue to possible get invested in the next Vault
   * @param _rolloverId Rollover
   * @param _tranche Tranche to invest in
   * @param _amount Token amount
   */
  function deposit(
    uint256 _rolloverId,
    OLib.Tranche _tranche,
    uint256 _amount
  ) external whenNotPaused notDead(_rolloverId) nonReentrant {
    Rollover storage rollover = rollovers[_rolloverId];
    uint256 shares;
    uint256 excess;
    uint256 lastUpdate = rollover.investorLastUpdates[_tranche][msg.sender];
    if (lastUpdate < rollover.thisRound + 1) {
      if (lastUpdate > 0) {
        (shares, excess) = _updateInvestor(msg.sender, _rolloverId, _tranche);
      } else {
        rollover.investorLastUpdates[_tranche][msg.sender] =
          rollover.thisRound +
          1;
      }
    }

    {
      Round storage round = rollover.rounds[rollover.thisRound + 1];
      uint256 vaultId = round.vaultId;
      require(vaultId != 0, "No Vault to deposit in yet");
      require(vaultManager.canDeposit(vaultId), "Vault not in deposit state");
      TrancheRound storage trancheround = round.tranches[_tranche];
      OLib.Investor storage investor = trancheround.investors[msg.sender];
      uint256 userSum =
        investor.userSums.length > 0
          ? investor.userSums[investor.userSums.length - 1] + _amount
          : _amount;
      IPairVault.VaultView memory vaultView =
        vaultManager.getVaultById(vaultId);
      uint256 userCap = vaultView.assets[uint256(_tranche)].userCap;
      require(
        userCap == 0 || userSum <= userCap,
        "Deposit amount exceeds user cap"
      );
      trancheround.newDeposited += _amount;
      investor.prefixSums.push(trancheround.newDeposited);
      investor.userSums.push(userSum);
    }

    if (excess > _amount) {
      rollover.assets[_tranche].safeTransfer(msg.sender, excess - _amount);
    } else if (excess < _amount) {
      rollover.assets[_tranche].safeTransferFrom(
        msg.sender,
        address(this),
        _amount - excess
      );
    }

    if (shares > 0) {
      rollover.rolloverTokens[_tranche].mint(msg.sender, shares);
    }

    emit Deposited(
      msg.sender,
      _rolloverId,
      uint256(_tranche),
      _amount,
      int256(_amount) - int256(excess),
      shares
    );
  }

  /**
   * @notice After a Rollover begins, get Rollover tranche tokens and excess deposits, if any
   * @param _rolloverId Rollover
   * @param _tranche Tranche
   */
  function claim(uint256 _rolloverId, OLib.Tranche _tranche)
    external
    whenNotPaused
    notDead(_rolloverId)
    nonReentrant
  {
    _claim(_rolloverId, _tranche);
  }

  function _claim(uint256 _rolloverId, OLib.Tranche _tranche) internal {
    Rollover storage rollover = rollovers[_rolloverId];
    if (
      rollover.investorLastUpdates[_tranche][msg.sender] !=
      rollover.thisRound + 1
    ) {
      _updateInvestorDistribute(msg.sender, _rolloverId, _tranche);
    }
  }

  function _updateInvestor(
    address _investor,
    uint256 _rolloverId,
    OLib.Tranche _tranche
  ) internal returns (uint256 shares, uint256 rejected) {
    (shares, rejected) = _getUpdatedInvestor(_investor, _rolloverId, _tranche);
    rollovers[_rolloverId].investorLastUpdates[_tranche][msg.sender] = 0;
  }

  function _updateInvestorDistribute(
    address _investor,
    uint256 _rolloverId,
    OLib.Tranche _tranche
  ) internal {
    (uint256 shares, uint256 rejected) =
      _updateInvestor(_investor, _rolloverId, _tranche);

    Rollover storage rollover = rollovers[_rolloverId];

    if (rejected > 0) {
      rollover.assets[_tranche].safeTransfer(_investor, rejected);
    }
    if (shares > 0) {
      rollover.rolloverTokens[_tranche].mint(_investor, shares);
    }

    emit Claimed(msg.sender, _rolloverId, uint256(_tranche), shares, rejected);
  }

  /**
   * @notice Withdraw funds from Rollover, receive tokens in Vault and excess amounts
   * @dev TRansfers Vault tokens and excess funds to caller
   * @param _rolloverId Rollover
   * @param _tranche Tranche
   * @param shares Number of shares to withdraw from rollover
   */
  function withdraw(
    uint256 _rolloverId,
    OLib.Tranche _tranche,
    uint256 shares
  ) external whenNotPaused nonReentrant {
    require(shares > 0, "No zero value");

    (uint256 newShares, uint256 excess) =
      _updateInvestor(msg.sender, _rolloverId, _tranche);

    Rollover storage rollover = rollovers[_rolloverId];
    Round storage round = rollover.rounds[rollover.thisRound];
    TrancheRound storage trancheround = round.tranches[_tranche];

    uint256 equivalentDeposit =
      (trancheround.deposited * shares) / trancheround.shares;
    uint256 equivalentInvested =
      (trancheround.invested * shares) / trancheround.shares;
    excess += equivalentDeposit - equivalentInvested;
    trancheround.shares -= shares;
    trancheround.deposited -= equivalentDeposit;
    trancheround.invested -= equivalentInvested;
    if (shares > newShares) {
      rollover.rolloverTokens[_tranche].burn(msg.sender, shares - newShares);
    } else if (newShares > shares) {
      rollover.rolloverTokens[_tranche].mint(msg.sender, newShares - shares);
    }

    if (equivalentInvested > 0) {
      IPairVault.VaultView memory vault =
        vaultManager.getVaultById(round.vaultId);
      vault.assets[uint256(_tranche)].trancheToken.safeTransfer(
        msg.sender,
        equivalentInvested
      );
    }
    if (excess > 0) {
      rollover.assets[_tranche].safeTransfer(msg.sender, excess);
    }
    emit Withdrew(
      msg.sender,
      _rolloverId,
      uint256(_tranche),
      equivalentInvested,
      excess
    );
  }

  /**
   * @notice Deposit LP tokens and excess
   * @param _rolloverId Rollover ID
   * @param _lpTokens Number of LP tokens to invest in this vault thru the rollover
   * @return newTokens senior/junior Rollover tokens issued
   * @return uninvested amount of senior/junior assets taken for uninvested pool
   */
  function depositLp(uint256 _rolloverId, uint256 _lpTokens)
    external
    nonReentrant
    whenNotPaused
    notDead(_rolloverId)
    returns (uint256[2] memory newTokens, uint256[2] memory uninvested)
  {
    Rollover storage rollover = rollovers[_rolloverId];
    Round storage round = rollover.rounds[rollover.thisRound];

    /* Steps (for both tranches):
     * 1. Transfer LP tokens into vault
     * 2. Transfer "uninvested" amounts into this
     * 3. Adjust internal bookkeeping: invested, deposited, shares go up
     * 4. Mint Rollover tokens
     */

    // Transfer LP tokens to this contract. Deposit into vault. Now have vault tranche tokens.
    (uint256 shares, uint256 vaultShares, IERC20 pool) =
      vaultManager.getVaultById(round.vaultId).strategy.sharesFromLp(
        round.vaultId,
        _lpTokens
      );
    pool.safeTransferFrom(msg.sender, address(this), _lpTokens);
    pool.ondoSafeIncreaseAllowance(address(vaultManager), _lpTokens);
    (newTokens[0], newTokens[1]) = vaultManager.depositLp(
      round.vaultId,
      _lpTokens
    );

    for (uint8 i = 0; i < 2; i++) {
      OLib.Tranche trancheId = OLib.Tranche(i);

      // call claim to mint any rollover tokens owed
      _claim(_rolloverId, trancheId);

      TrancheRound storage trancheRound = round.tranches[trancheId];

      // Calculate and take the extra "uninvested" tokens from user
      uninvested[i] =
        ((trancheRound.deposited - trancheRound.invested) * shares) /
        vaultShares;
      rollover.assets[trancheId].safeTransferFrom(
        msg.sender,
        address(this),
        uninvested[i]
      );

      // Bookkeeping: invested += new tokens, deposited = new tokens + uninvested excess
      trancheRound.invested += newTokens[i];
      trancheRound.shares += newTokens[i];
      trancheRound.deposited += newTokens[i] + uninvested[i];

      // Mint rollover tokens
      rollover.rolloverTokens[trancheId].mint(msg.sender, newTokens[i]);
    }
  }

  function withdrawLp(uint256 _rolloverId, uint256 _lpTokens)
    external
    whenNotPaused
    notDead(_rolloverId)
    nonReentrant
    returns (
      uint256[2] memory vaultTokensBurned,
      uint256[2] memory excessTokensReturned
    )
  {
    _claim(_rolloverId, OLib.Tranche.Senior);
    _claim(_rolloverId, OLib.Tranche.Junior);

    Rollover storage rollover = rollovers[_rolloverId];
    Round storage round = rollover.rounds[rollover.thisRound];

    (uint256 shares, uint256 vaultShares, IERC20 pool) =
      vaultManager.getVaultById(round.vaultId).strategy.sharesFromLp(
        round.vaultId,
        _lpTokens
      );

    (vaultTokensBurned[0], vaultTokensBurned[1]) = vaultManager.withdrawLp(
      round.vaultId,
      shares
    );
    pool.safeTransfer(msg.sender, _lpTokens);

    for (uint8 i = 0; i < 2; i++) {
      OLib.Tranche tranche = OLib.Tranche(i);
      TrancheRound storage trancheround = round.tranches[tranche];
      excessTokensReturned[i] =
        (shares * (trancheround.deposited - trancheround.invested)) /
        vaultShares;
      rollover.assets[tranche].safeTransfer(
        msg.sender,
        excessTokensReturned[i]
      );
      trancheround.invested -= vaultTokensBurned[i];
      trancheround.shares -= vaultTokensBurned[i];
      trancheround.deposited -= vaultTokensBurned[i] + excessTokensReturned[i];
      rollover.rolloverTokens[tranche].burn(msg.sender, vaultTokensBurned[i]);
    }
  }

  /**
   * @notice Withdraw funds from expiring Vault, reinvest in next Vault
   * @dev Special care taken when it's the first Vault
   * @param _rolloverId Rollover
   * @param _slippage Extra info to ensure get a good price on AMM
   */
  function migrate(uint256 _rolloverId, SlippageSettings memory _slippage)
    external
    whenNotPaused
    notDead(_rolloverId)
    onlyStrategist(_rolloverId)
  {
    if (rollovers[_rolloverId].thisRound == 0) {
      _firstInvest(
        _rolloverId,
        _slippage.seniorMinInvest,
        _slippage.juniorMinInvest
      );
    } else {
      _migrate(_rolloverId, _slippage);
    }
  }

  function _migrate(uint256 _rolloverId, SlippageSettings memory _slippage)
    internal
  {
    Rollover storage rollover = rollovers[_rolloverId];
    Round storage last = rollover.rounds[rollover.thisRound];
    TrancheRound storage srLastRound = last.tranches[OLib.Tranche.Senior];
    TrancheRound storage jrLastRound = last.tranches[OLib.Tranche.Junior];

    vaultManager.redeem(
      last.vaultId,
      _slippage.seniorMinRedeem,
      _slippage.juniorMinRedeem
    );

    uint256 srAmount = vaultManager.withdraw(last.vaultId, OLib.Tranche.Senior);
    uint256 jrAmount = vaultManager.withdraw(last.vaultId, OLib.Tranche.Junior);

    srLastRound.redeemed = srAmount;
    jrLastRound.redeemed = jrAmount;

    if (jrAmount <= jrLastRound.deposited / 100) {
      rollover.dead = true;
      vaultManager.setRollover(
        rollover.rounds[rollover.thisRound + 1].vaultId,
        address(0),
        _rolloverId
      );
      return;
    }

    srAmount += srLastRound.deposited - srLastRound.invested;
    jrAmount += jrLastRound.deposited - jrLastRound.invested;

    TrancheRound storage srNextRound =
      rollover.rounds[rollover.thisRound + 1].tranches[OLib.Tranche.Senior];
    TrancheRound storage jrNextRound =
      rollover.rounds[rollover.thisRound + 1].tranches[OLib.Tranche.Junior];

    srAmount += srNextRound.newDeposited;
    jrAmount += jrNextRound.newDeposited;

    uint256 nextId = rollover.rounds[rollover.thisRound + 1].vaultId;

    (srNextRound.invested, jrNextRound.invested) = _invest(
      _rolloverId,
      nextId,
      srAmount,
      jrAmount,
      _slippage.seniorMinInvest,
      _slippage.juniorMinInvest
    );

    uint256 srRolloverDeposit =
      _roundAccounting(srLastRound, srNextRound, srAmount);
    uint256 jrRolloverDeposit =
      _roundAccounting(jrLastRound, jrNextRound, jrAmount);

    rollover.thisRound++;
    emit MigratedRollover(
      _rolloverId,
      nextId,
      srRolloverDeposit,
      jrRolloverDeposit
    );
  }

  function _roundAccounting(
    TrancheRound storage _lastRound,
    TrancheRound storage _nextRound,
    uint256 _amount
  ) internal returns (uint256 _rolloverDeposit) {
    _rolloverDeposit = _amount - _nextRound.newDeposited;

    if (_nextRound.invested >= _amount) {
      _nextRound.newInvested = _nextRound.newDeposited;
    } else if (_rolloverDeposit < _nextRound.invested) {
      _nextRound.newInvested = _nextRound.invested - _rolloverDeposit;
    }

    _nextRound.deposited = _rolloverDeposit + _nextRound.newInvested;

    uint256 newShares =
      (_nextRound.newInvested * _lastRound.shares) / _rolloverDeposit;

    _nextRound.shares = _lastRound.shares + newShares;
  }

  function _firstInvest(
    uint256 _rolloverId,
    uint256 _seniorMinInvest,
    uint256 _juniorMinInvest
  ) internal {
    Rollover storage rollover = rollovers[_rolloverId];
    Round storage round = rollover.rounds[1];
    TrancheRound storage srRound = round.tranches[OLib.Tranche.Senior];
    TrancheRound storage jrRound = round.tranches[OLib.Tranche.Junior];

    (srRound.invested, jrRound.invested) = _invest(
      _rolloverId,
      round.vaultId,
      srRound.newDeposited,
      jrRound.newDeposited,
      _seniorMinInvest,
      _juniorMinInvest
    );

    srRound.deposited = srRound.invested;
    jrRound.deposited = jrRound.invested;
    srRound.newInvested = srRound.invested;
    jrRound.newInvested = jrRound.invested;
    srRound.shares = srRound.invested;
    jrRound.shares = jrRound.invested;
    rollover.thisRound = 1;
  }

  function _invest(
    uint256 _rolloverId,
    uint256 _vaultId,
    uint256 _srNewDeposited,
    uint256 _jrNewDeposited,
    uint256 _seniorMinInvest,
    uint256 _juniorMinInvest
  ) internal returns (uint256 srInvested, uint256 jrInvested) {
    require(_vaultId != 0, "Vault not set");

    Rollover storage rollover = rollovers[_rolloverId];
    rollover.assets[OLib.Tranche.Senior].ondoSafeIncreaseAllowance(
      address(vaultManager),
      _srNewDeposited
    );
    rollover.assets[OLib.Tranche.Junior].ondoSafeIncreaseAllowance(
      address(vaultManager),
      _jrNewDeposited
    );
    vaultManager.depositFromRollover(
      _vaultId,
      _rolloverId,
      _srNewDeposited,
      _jrNewDeposited
    );
    vaultManager.invest(_vaultId, _seniorMinInvest, _juniorMinInvest);
    (srInvested, jrInvested) = vaultManager.rolloverClaim(
      _vaultId,
      _rolloverId
    );
  }
}
