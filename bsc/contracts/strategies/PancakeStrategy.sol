// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/strategies/BasePairLPStrategy.sol";
import "bsc/contracts/libraries/PancakeSwapLibrary.sol";
import "contracts/Registry.sol";

/**
 * @title Simple PancakeSwap Strategy for core tests only
 * @notice Add and remove liquidity to PancakeSwap
 */
contract PancakeStrategy is BasePairLPStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  // Pointers to Uniswap contracts
  IUniswapV2Router02 public immutable uniRouter02;
  address public immutable uniFactory;

  string public constant name = "Ondo PancakeSwap Simple Strategy";
  struct Call {
    address target;
    bytes data;
  }

  address[] public swapPathSeniorToJunior;
  address[] public swapPathJuniorToSenior;

  /**
   * @dev
   * @param _registry Ondo global registry
   * @param _router Address for UniswapV2Router02
   * @param _factory Address for UniswapV2Factory
   */
  constructor(
    address _registry,
    address _router,
    address _factory,
    address[] memory _seniorToJuniorPath,
    address[] memory _juniorToSeniorPath
  ) BasePairLPStrategy(_registry) {
    require(_router != address(0) && _factory != address(0), "Invalid target");

    uniRouter02 = IUniswapV2Router02(_router);
    uniFactory = _factory;

    swapPathJuniorToSenior = _juniorToSeniorPath;
    swapPathSeniorToJunior = _seniorToJuniorPath;
  }

  /**
   * @notice Conversion of LP tokens to shares
   * @dev Simpler than Sushiswap strat because there's no compounding investment. Shares don't change.
   * @param vaultId Vault
   * @param lpTokens Amount of LP tokens
   * @return Number of shares for LP tokens
   * @return Total shares for this Vault
   * @return Uniswap pool
   */
  function sharesFromLp(uint256 vaultId, uint256 lpTokens)
    external
    view
    override
    returns (
      uint256,
      uint256,
      IERC20
    )
  {
    Vault storage vault_ = vaults[vaultId];
    return (lpTokens, vault_.shares, vault_.pool);
  }

  /**
   * @notice Conversion of shares to LP tokens
   * @param vaultId Vault
   * @param shares Amount of shares
   * @return Number LP tokens
   * @return Total shares for this Vault
   */
  function lpFromShares(uint256 vaultId, uint256 shares)
    external
    view
    override
    returns (uint256, uint256)
  {
    Vault storage vault_ = vaults[vaultId];
    return (shares, vault_.shares);
  }

  /**
   * @notice Check whether liquidity pool already exists
   * @param _senior Asset used for senior tranche
   * @param _junior Asset used for junior tranche
   */
  function poolExists(IERC20 _senior, IERC20 _junior)
    internal
    view
    returns (bool)
  {
    return
      IUniswapV2Factory(uniFactory).getPair(
        address(_senior),
        address(_junior)
      ) != address(0);
  }

  /**
   * @notice AllPairsVault registers Vault here
   * @param _vaultId Reference to Vault
   * @param _senior Asset used for senior tranche
   * @param _junior Asset used for junior tranche
   */
  function addVault(
    uint256 _vaultId,
    IERC20 _senior,
    IERC20 _junior
  ) external override nonReentrant isAuthorized(OLib.VAULT_ROLE) {
    require(
      address(vaults[_vaultId].origin) == address(0),
      "Vault id already registered"
    );
    require(poolExists(_senior, _junior), "Pool doesn't exist");
    Vault storage vault_ = vaults[_vaultId];
    vault_.origin = IPairVault(msg.sender);
    vault_.pool = IERC20(
      PancakeSwapLibrary.pairFor(uniFactory, address(_senior), address(_junior))
    );
    vault_.senior = IERC20(_senior);
    vault_.junior = IERC20(_junior);
  }

  /**
   * @notice Simple wrapper around uniswap
   * @param amtIn Amount in
   * @param minOut Minimum out
   * @param path Router path
   */
  function swapExactIn(
    uint256 amtIn,
    uint256 minOut,
    address[] memory path
  ) internal returns (uint256) {
    IERC20(path[0]).ondoSafeIncreaseAllowance(address(uniRouter02), amtIn);
    return
      uniRouter02.swapExactTokensForTokens(
        amtIn,
        minOut,
        path,
        address(this),
        block.timestamp
      )[path.length - 1];
  }

  /**
   * @notice Simple wrapper around uniswap
   * @param amtOut Amount out
   * @param maxIn Maximum tokens offered as input
   * @param path Router path
   */
  function swapExactOut(
    uint256 amtOut,
    uint256 maxIn,
    address[] memory path
  ) internal returns (uint256) {
    IERC20(path[0]).ondoSafeIncreaseAllowance(address(uniRouter02), maxIn);
    return
      uniRouter02.swapTokensForExactTokens(
        amtOut,
        maxIn,
        path,
        address(this),
        block.timestamp
      )[0];
  }

  /**
   * @dev Given the total available amounts of senior and junior asset
   *      tokens, invest as much as possible and record any excess uninvested
   *      assets.
   * @param _vaultId Reference to specific Vault
   * @param _totalSenior Total amount available to invest into senior assets
   * @param _totalJunior Total amount available to invest into junior assets
   * @param _extraSenior Extra funds due to cap on tranche, must be returned
   * @param _extraJunior Extra funds due to cap on tranche, must be returned
   * @param _seniorMinIn To ensure you get a decent price
   * @param _juniorMinIn Same. Passed to addLiquidity on AMM
   */
  function invest(
    uint256 _vaultId,
    uint256 _totalSenior,
    uint256 _totalJunior,
    uint256 _extraSenior,
    uint256 _extraJunior,
    uint256 _seniorMinIn,
    uint256 _juniorMinIn
  )
    external
    override
    nonReentrant
    whenNotPaused
    onlyOrigin(_vaultId)
    returns (uint256 seniorInvested, uint256 juniorInvested)
  {
    Vault storage vault_ = vaults[_vaultId];
    vault_.senior.ondoSafeIncreaseAllowance(address(uniRouter02), _totalSenior);
    vault_.junior.ondoSafeIncreaseAllowance(address(uniRouter02), _totalJunior);
    uint256 lpTokens;

    (seniorInvested, juniorInvested, lpTokens) = uniRouter02.addLiquidity(
      address(vault_.senior),
      address(vault_.junior),
      _totalSenior,
      _totalJunior,
      _seniorMinIn,
      _juniorMinIn,
      address(this),
      block.timestamp
    );
    vault_.shares += lpTokens;
    vault_.seniorExcess = _totalSenior - seniorInvested + _extraSenior;
    vault_.juniorExcess = _totalJunior - juniorInvested + _extraJunior;
    emit Invest(_vaultId, vault_.shares);
  }

  function getPathJuniorToSenior()
    internal
    view
    returns (address[] memory path)
  {
    return swapPathJuniorToSenior;
  }

  function setPathJuniorToSenior(address[] memory _jrToSrPath)
    external
    isAuthorized(OLib.STRATEGIST_ROLE)
  {
    swapPathJuniorToSenior = _jrToSrPath;
  }

  function getPathSeniorToJunior()
    internal
    view
    returns (address[] memory path)
  {
    return swapPathSeniorToJunior;
  }

  function setPathSeniorToJunior(address[] memory _srToJrPath)
    external
    isAuthorized(OLib.STRATEGIST_ROLE)
  {
    swapPathSeniorToJunior = _srToJrPath;
  }

  function swapForSr(
    address _senior,
    address _junior,
    uint256 _seniorExpected,
    uint256 seniorReceived,
    uint256 juniorReceived
  ) internal returns (uint256, uint256) {
    uint256 seniorNeeded = _seniorExpected - seniorReceived;
    address[] memory jr2Sr = getPathJuniorToSenior();
    if (
      seniorNeeded >
      PancakeSwapLibrary.getAmountsOut(uniFactory, juniorReceived, jr2Sr)[1]
    ) {
      seniorReceived += swapExactIn(juniorReceived, 0, jr2Sr);
      return (seniorReceived, 0);
    } else {
      juniorReceived -= swapExactOut(seniorNeeded, juniorReceived, jr2Sr);
      return (_seniorExpected, juniorReceived);
    }
  }

  /**
   * @dev Convert all LP tokens back into the pair of underlying
   *      assets. Also convert any Sushi equally into both tranches.
   *      The senior tranche is expecting to get paid some hurdle
   *      rate above where they started. Here are the possible outcomes:
   * - If the senior tranche doesn't have enough, then sell some or
   *         all junior tokens to get the senior to the expected
   *         returns. In the worst case, the senior tranche could suffer
   *         a loss and the junior tranche will be wiped out.
   * - If the senior tranche has more than enough, reduce this tranche
   *    to the expected payoff. The excess senior tokens should be
   *    converted to junior tokens.
   * @param _vaultId Reference to a specific Vault
   * @param _seniorExpected Amount the senior tranche is expecting
   * @param _seniorMinReceived Compute total for seniorReceived, factoring in slippage
   * @param _juniorMinReceived Same.
   * @return seniorReceived Final amount for senior tranche
   * @return juniorReceived Final amount for junior tranche
   */
  function redeem(
    uint256 _vaultId,
    uint256 _seniorExpected,
    uint256 _seniorMinReceived,
    uint256 _juniorMinReceived
  )
    external
    override
    nonReentrant
    whenNotPaused
    onlyOrigin(_vaultId)
    returns (uint256 seniorReceived, uint256 juniorReceived)
  {
    Vault storage vault_ = vaults[_vaultId];
    {
      IERC20 pool = IERC20(vault_.pool);
      IERC20(pool).ondoSafeIncreaseAllowance(
        address(uniRouter02),
        vault_.shares
      );
      (seniorReceived, juniorReceived) = uniRouter02.removeLiquidity(
        address(vault_.senior),
        address(vault_.junior),
        vault_.shares,
        0,
        0,
        address(this),
        block.timestamp
      );
    }
    if (seniorReceived < _seniorExpected) {
      (seniorReceived, juniorReceived) = swapForSr(
        address(vault_.senior),
        address(vault_.junior),
        _seniorExpected,
        seniorReceived,
        juniorReceived
      );
    } else {
      if (seniorReceived > _seniorExpected) {
        juniorReceived += swapExactIn(
          seniorReceived - _seniorExpected,
          0,
          getPathSeniorToJunior()
        );
      }
      seniorReceived = _seniorExpected;
    }
    require(
      _seniorMinReceived <= seniorReceived &&
        _juniorMinReceived <= juniorReceived,
      "Too much slippage"
    );
    vault_.senior.ondoSafeIncreaseAllowance(
      msg.sender,
      seniorReceived + vault_.seniorExcess
    );
    vault_.junior.ondoSafeIncreaseAllowance(
      msg.sender,
      juniorReceived + vault_.juniorExcess
    );
    emit Redeem(_vaultId);
    return (seniorReceived, juniorReceived);
  }

  function multiexcall(Call[] calldata calls)
    external
    isAuthorized(OLib.GUARDIAN_ROLE)
    returns (bytes[] memory returnData)
  {
    returnData = new bytes[](calls.length);
    for (uint256 i = 0; i < calls.length; i++) {
      (bool success, bytes memory ret) = calls[i].target.call(calls[i].data);
      require(success, "Multicall aggregate: call failed");
      returnData[i] = ret;
    }
  }
}
