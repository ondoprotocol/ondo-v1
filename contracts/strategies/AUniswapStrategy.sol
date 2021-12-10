// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.3;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/strategies/BasePairLPStrategy.sol";
import "contracts/vendor/uniswap/UniswapV2Library.sol";
import "contracts/vendor/uniswap/SushiSwapLibrary.sol";
import "contracts/Registry.sol";
import "@uniswap/lib/contracts/libraries/Babylonian.sol";

/**
 * @title Access Uniswap
 * @notice Add and remove liquidity to Uniswap
 */
abstract contract AUniswapStrategy is BasePairLPStrategy {
  using SafeERC20 for IERC20;
  using OndoSaferERC20 for IERC20;

  // Pointers to Uniswap contracts
  IUniswapV2Router02 public immutable uniRouter02;
  uint8 public amm;
  address public immutable uniFactory;
  struct Call {
    address target;
    bytes data;
  }

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
    uint8 _amm
  ) BasePairLPStrategy(_registry) {
    require(_router != address(0) && _factory != address(0), "Invalid target");
    require(_amm == 0 || _amm == 1, "Invalid AMM");
    amm = _amm;
    uniRouter02 = IUniswapV2Router02(_router);
    uniFactory = _factory;
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
    virtual
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
    virtual
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
    return getPair(address(_senior), address(_junior)) != address(0);
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
    vault_.pool = IERC20(getPair(address(_senior), address(_junior)));
    vault_.senior = IERC20(_senior);
    vault_.junior = IERC20(_junior);
  }

  function getPair(address senior, address junior)
    internal
    view
    virtual
    returns (address)
  {
    if (amm == 0) {
      return UniswapV2Library.pairFor(uniFactory, senior, junior);
    } else {
      return SushiSwapLibrary.pairFor(uniFactory, senior, junior);
    }
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
    virtual
    override
    nonReentrant
    whenNotPaused
    onlyOrigin(_vaultId)
    returns (uint256 seniorInvested, uint256 juniorInvested)
  {
    (seniorInvested, juniorInvested, ) = _invest(
      _vaultId,
      _totalSenior,
      _totalJunior,
      _extraSenior,
      _extraJunior,
      _seniorMinIn,
      _juniorMinIn
    );
  }

  function _invest(
    uint256 _vaultId,
    uint256 _totalSenior,
    uint256 _totalJunior,
    uint256 _extraSenior,
    uint256 _extraJunior,
    uint256 _seniorMinIn,
    uint256 _juniorMinIn
  )
    internal
    returns (
      uint256 seniorInvested,
      uint256 juniorInvested,
      uint256 lpTokens
    )
  {
    Vault storage vault_ = vaults[_vaultId];
    vault_.senior.ondoSafeIncreaseAllowance(address(uniRouter02), _totalSenior);
    vault_.junior.ondoSafeIncreaseAllowance(address(uniRouter02), _totalJunior);

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

  // hack to get stack down for redeem
  function getPath(address _token0, address _token1)
    internal
    pure
    returns (address[] memory path)
  {
    path = new address[](2);
    path[0] = _token0;
    path[1] = _token1;
  }

  function swapForSr(
    address _senior,
    address _junior,
    uint256 _seniorExpected,
    uint256 seniorReceived,
    uint256 juniorReceived
  ) internal returns (uint256, uint256) {
    uint256 seniorNeeded = _seniorExpected - seniorReceived;
    address[] memory jr2Sr = getPath(_junior, _senior);
    if (seniorNeeded > getAmountsOut(juniorReceived, jr2Sr)[1]) {
      seniorReceived += swapExactIn(juniorReceived, 0, jr2Sr);
      return (seniorReceived, 0);
    } else {
      juniorReceived -= swapExactOut(seniorNeeded, juniorReceived, jr2Sr);
      return (_seniorExpected, juniorReceived);
    }
  }

  function getAmountsOut(uint256 juniorReceived, address[] memory jr2Sr)
    internal
    view
    virtual
    returns (uint256[] memory)
  {
    if (amm == 0) {
      return UniswapV2Library.getAmountsOut(uniFactory, juniorReceived, jr2Sr);
    } else {
      return SushiSwapLibrary.getAmountsOut(uniFactory, juniorReceived, jr2Sr);
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
    virtual
    override
    nonReentrant
    whenNotPaused
    onlyOrigin(_vaultId)
    returns (uint256 seniorReceived, uint256 juniorReceived)
  {
    Vault storage vault_ = vaults[_vaultId];
    return
      _redeem(
        _vaultId,
        vault_.shares,
        _seniorExpected,
        _seniorMinReceived,
        _juniorMinReceived
      );
  }

  function _redeem(
    uint256 _vaultId,
    uint256 _totaLP,
    uint256 _seniorExpected,
    uint256 _seniorMinReceived,
    uint256 _juniorMinReceived
  ) internal returns (uint256 seniorReceived, uint256 juniorReceived) {
    Vault storage vault_ = vaults[_vaultId];
    {
      IERC20 pool = IERC20(vault_.pool);
      IERC20(pool).ondoSafeIncreaseAllowance(address(uniRouter02), _totaLP);
      (seniorReceived, juniorReceived) = uniRouter02.removeLiquidity(
        address(vault_.senior),
        address(vault_.junior),
        _totaLP,
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
          getPath(address(vault_.senior), address(vault_.junior))
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

  function calculateSwapInAmount(uint256 reserveIn, uint256 userIn)
    internal
    pure
    returns (uint256)
  {
    return
      (Babylonian.sqrt(reserveIn * (userIn * 3988000 + reserveIn * 3988009)) -
        reserveIn *
        1997) / 1994;
  }

  function swapBForA(
    address a,
    address b,
    uint256 aAmount,
    uint256 bAmount
  ) internal returns (uint256, uint256) {
    (uint256 aReserve, uint256 bReserve) =
      amm == 0
        ? UniswapV2Library.getReserves(uniFactory, address(a), address(b))
        : SushiSwapLibrary.getReserves(uniFactory, address(a), address(b));

    // fancy math to get the amountToSwap
    uint256 amountToSwap = calculateSwapInAmount(bReserve, bAmount);
    // subtract bond amount since that amount will be converted to usdc
    bAmount -= amountToSwap;
    // convert bond to usdc
    aAmount += swapExactIn(amountToSwap, 0, getPath(address(b), address(a)));
    return (aAmount, bAmount);
  }

  function sellAForB(
    address a,
    address b,
    uint256 amountA
  ) internal returns (uint256 bAmount) {
    bAmount = swapExactIn(amountA, 0, getPath(a, b));
  }

  // you have some quantity of a and b and you want to add liquidity so both can be added as much as possible
  function investAandB(
    address a,
    address b,
    uint256 amountA,
    uint256 amountB
  )
    internal
    returns (
      uint256 seniorInvested,
      uint256 juniorInvested,
      uint256 lpTokens
    )
  {
    (seniorInvested, juniorInvested, lpTokens) = addLiquidity(
      address(a),
      address(a),
      amountA,
      amountB,
      0,
      0
    );
    // one of the asssets is now zero or close to zero
    amountA -= seniorInvested;
    amountB -= juniorInvested;
    // if we have more weth then eden, then swap weth for eden, 50/50
    if (amountA > amountB) {
      (amountB, amountA) = swapBForA(b, a, amountB, amountA);
    } else if (amountB > 0) {
      (amountA, amountB) = swapBForA(a, b, amountA, amountB);
    }
    // if either of the amounts is greater than zero we can try adding liquidity
    if (amountA > 0 || amountB > 0) {
      uint256 lpTokens2;
      (seniorInvested, juniorInvested, lpTokens2) = addLiquidity(
        a,
        b,
        amountA,
        amountB,
        0,
        0
      );
      lpTokens += lpTokens2;
    }
  }

  // you have a single asset and you want to split that with b and add liquidity
  function investB(
    address a,
    address b,
    uint256 amountA,
    uint256 amountB
  )
    internal
    returns (
      uint256 seniorInvested,
      uint256 juniorInvested,
      uint256 lpTokens
    )
  {
    (amountA, amountB) = swapBForA(a, b, amountA, amountB);

    (seniorInvested, juniorInvested, lpTokens) = addLiquidity(
      a,
      b,
      amountA,
      amountB,
      0,
      0
    );
  }

  function addLiquidity(
    address token0,
    address token1,
    uint256 amt0,
    uint256 amt1,
    uint256 minOut0,
    uint256 minOut1
  )
    internal
    returns (
      uint256 out0,
      uint256 out1,
      uint256 lp
    )
  {
    IERC20(token0).ondoSafeIncreaseAllowance(address(uniRouter02), amt0);
    IERC20(token1).ondoSafeIncreaseAllowance(address(uniRouter02), amt1);
    (out0, out1, lp) = uniRouter02.addLiquidity(
      token0,
      token1,
      amt0,
      amt1,
      minOut0,
      minOut1,
      address(this),
      block.timestamp
    );
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
  // function _rescueStuckTokens(address[] calldata _tokens) internal override {
  //   super._rescueStuckTokens(_tokens);
  // }
}
