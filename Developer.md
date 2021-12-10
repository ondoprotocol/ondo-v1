
***Overview***

The goal of this code is to allow investors to shift the risk and
reward balance between each other. In this implementation we restrict
investors into two groups: the senior and junior tranche. The senior
tranche will receive a fixed percentage over their initial
investments. The junior tranche will receive any excess returns over
the senior tranche. This fixed percentage, called the hurdle rate, is
determined when the product is created.

The underlying investment is liquidity provider tokens on
decentralized exchanges, e.g. Uniswap, Sushiswap, Balancer, Curve,
etc. Liquidity providers inject an equal value of a pair of assets
into a liquidity pool. In return they earn fees and incentives for
providing liquidity, which is collected by withdrawing liquidity from
the pool.

**Vaults**

A Vault allows investors to provide liquidity together and share in
the profits/losses. Consider the trading pair on Uniswap of
DAI/ETH. The senior tranche investor will provide one asset, while the
junior tranche investor will provide the other. Let's say the senior
provides DAI and junior provides ETH. They will deposit their assets
into the Vault contract. A Creator will set the hurdle rate for the
senior tranche. In this example, let's say it is 10% annualized. The
Vault will remain open for deposits for a short period, then it will
close and the Strategist will invest the assets into the AMM's
liquidity pool. After some duration (say 4 weeks), the Strategist will
redeem the LP tokens for both assets. The Vault contract will ensure
the senior tranche gets their expected hurdle rate of return, while the
junior tranche will get any excess returns. Both investors can
withdraw their funds and the Vault is now finished.

One complication is the Vault can only use the correct ratio of senior
and junior assets to get LP tokens. If investors deposit too much into
a tranche, there will be an imbalance. The Vault can not use all those
assets, so some will be an "excess deposit". This must be available
for investors to reclaim. To be fair, deposits are ordered in a queue
and excess deposits at the end of the queue are rejected.

*Redeem investment*

There are a few situations that can occur when the LP tokens are
removed from the liquidty pool for the underlying senior and junior
assets.

- Senior assets exceed the hurdle rate. Then excess senior assets are
  converted to the junior asset.
- Senior assets are below hurdle rate. Enough junior assets are
  converted to senior to meet the hurdle rate.
  - It's possible we sell so much junior assets they experience a
    loss.
  - It's possible we sell ALL the junior assets, and still don't have
    enough to meet the senior hurdle rate. This is the only way the
    senior tranche will experience any loss.

If the DEX also offers mining incentives, then that should be sold and
added to the pool of assets divided between junior and senior
tranches.

*Tranche Tokens*

Once a Vault starts we issue tokens representing the senior and junior
tranche to investors. These tokens can be traded on any DEX. Rather
than be stuck in a Vault for a month, an investor can sell their
tokens to another investor to get out early. Only at the end of the
Vault can investors burn their tokens to collect their principal plus
share of any profits (loss). The amount of tokens owed users is not
known until the Vault is invested. Therefore, if a user wants these
tokens they must call `claim`. If they don't claim these tokens,
`withdraw` after the Vault is complete will still return all the funds
the user is owed. 

*Midterm LP deposits*

Once a Vault is invested, it is still possible to invest in the Vault by
depositing the correct LP tokens. When the Vault began it invested the
senior and junior assets at a specific ratio, e.g. 2500 DAI for 1
ETH. Investors can add LP at any time, but they will earn tranche
tokens at that same ratio regardless of the current ratio in the
market. Note they will receive both senior and junior tranche tokens,
so their economic exposure is no different than owning LP tokens. If
an LP investor want to be exposed to only the junior tranche, they can
sell their senior tokens in an exchange. 

It's also possible to withdraw LP tokens at any time. Simply purchase
senior and junior tranche tokens at the right ratio, then call the
contract to get LP tokens out. This mechanism of depositing and
withdrawing LP tokens at any time allows arbitrageurs to ensure the
price of the tranche tokens remain accurate. If they are too cheap, it
is profitable to buy tranche tokens and exchange for LP. If it is too
expensive, it is better to buy LP, deposit in the Vault, and then sell
those tranche tokens into the market at the inflated price. This is
the same mechanism used by large banks to keep ETF index prices
accurate in the market.

**Rollover**

These Vault products have a fixed duration, preferably short. Investors
would need to reclaim their assets from an expired Vault and reinvest in
a new Vault. To automate this process, a Rollover fund is an actively
managed product that invests in a series of similar Vaults. Investors
can deposit money into the Rollover, get a token to represent their
stake, and redeem it later to collect their investment plus profits
(losses).

Like the Vault, deposits into the Rollover are recorded into a queue
until the Vault is invested. The Rollover is a special account that has
priority over deposits directly into the Vault. Remember, the goal is to
invest a balanced ratio between the senior and junior assets into an
AMM liquidity pool. One side will be fully invested, the other will
have excess funds. The priority order of money invested into a Vault is
(1) money already invested in a Rollover, (2) new money deposited in a
Rollover, (3) new money deposited into the Vault. It is possible the
imbalance could be so severe that (2) and (3) don't get in, and even
some of (1) doesn't get in.

Consider a simple example. Senior and junior investors each invest
$100 into a Vault. This Vault returns $40. The senior keeps 10% earnings
to get $110. The junior gets the rest: $130. To invest in the next Vault
(assuming it's again at a 1:1 ratio) the senior and junior invests
$110, but the junior has $20 uninvested. If there is an additional $20
in new deposits in the senior tranche, then we can match the junior
excess and invest it. If not, that $20 is held until we try again for
the next Vault some time later.

The Vaults can have different hurdle rates based on market
dynamics. Therefore, a new Vault may not be created until a few days
before the current Vault is about to finish. The Creator will update
the Rollover to either point to the next Vault or create a new Vault.

To exit the Rollover fund, investors call withdraw. Since the Vault is
likely still running, we can not return assets at this point. Instead,
investors get tranche tokens for the underlying fixed-duration Vault,
plus their share of any excess uninvested assets. Investors can wait
until the Vault is complete to redeem their tokens for
cash. Alternatively, they can go to a secondary market to sell their
tokens to another investor.

Periodically, the strategist will call migrate to redeem the
Rollover's shares from the completed Vault and invest in the next
Vault. This is how we've created a perpetual risk tranching investment
product.

*Midterm LP deposit*

We want to allow users to deposit LP into a Rollover. This is mostly a
pass-through into the underlying vault. However, a Rollover has some
additional bookkeeping. Recall a Rollover has an "invested" amount
that is in a vault, and an "uninvested" pool that did not get into the
current vault. To maintain this balance, a user must also deposit
their share of the uninvested pool to match their LP deposit. 

Similarly, withdrawing LP from a Rollover will withdraw LP from the
underlying vault. In addition, the Rollover will send back to the user
their share of any uninvested pool lingering in the Rollover. 

***Implementation***

The file `AllPairVault.sol` contains most of the implementation for
Vaults. Rather than create unique contract instances for each Vault, the
state for all Vaults is stored in a mapping. Each Vault has a unique id
number created by hashing the metadata on the Vault.

**AllPairsVault**

*Bookkeeping*

In IPairVault the struct `Asset` holds data to keep track of each
tranche in a vault.

- deposited: the amount deposited by users for this vault
- originalInvested: the amount invested when `invest` 
- totalInvested: this is originalInvested plus any midterm deposits of
  LP tokens. 
- received: when `redeem` pulls the assets from the investment
- rolloverDeposited: amount deposited by the Rollover fund

*createVault*

Called by a Creator role, who decides on the terms of this product;
particularly, the asset pair and the hurdle rate. This a gas intensive
function that sets up the infrastructure for a Vault, including the
tranche tokens for both senior and junior tranches. 

*deposit*

The deposit function is called by investors to transfer an asset for a
single tranche in a specific Vault. The assets are transferred to the
underlying Strategy contract. However, the funds are not invested
yet. Instead, we maintain a queue of deposits to determine, at the
moment we invest, how many of these deposits we can use. It's likely
we can use all of one side, but only some of the other.

*invest*

A Strategist is allowed to call invest once the open period has
expired for new depositors. The function calls the underlying strategy
contract to put the funds into the AMM. This is where we calculate
what the ratio of senior and junior assets are for this Vault. This
function determines how much of the deposits can be used, marking the
excess deposits as available to be reclaimed.

*claim*

After the Vault has been invested, we now know how much of all the
deposits got into the Vault. Investors call claim to (1) reclaim
deposits that didn't get in, and (2) get tranche tokens representing
their deposits that did get in. (It's possible an investor put in
$1000, but only $600 get in.)

*redeem*

After the pre-defined duration for the Vault has expired, the
Strategist can now call redeem to convert the LP tokens to assets and
rebalance the 2 tranches. The expected senior tranche is simply the
percent earnings owed to the senior tranche. The redeem function on
the strategy contract will handle the logic for balancing the
tranches by selling assets. 

*withdraw*

After the redeem function has executed, the contract will be in
`Withdraw` state. Now investors can burn their tranche tokens to
collect their share of the tranche asset pool. We compute the fraction
of the initial deposit for the investor, and return that fraction of
the redeemed pool for the tranche.

*depositLp & withdrawLp*

At any time after a Vault has started, investors can add/remove LP
tokens from the Vault directly. Adding LP tokens results in an
equivalent ratio of senior and junior tranche tokens. Similarly, by
burning senior and junior tranche tokens in the right ratio, investors
can remove LP tokens from the Vault. This allows arbitrageurs to monitor
prices of tranche tokens in secondary markets. If they are too high,
inject LP tokens and sell tranche tokens into the market. If they are
too low, buy the tranche tokens and redeem for LP tokens. This

**RolloverVault**

*Bookkeeping* 

In RolloverVault the struct TrancheRound maintains data about each
vault it has invested in. 

- deposited: amount deposited by users in this tranche
- invested: amount invested into vault
- redeemed: amount pulled out from vault
- shares: total outstanding shares for this tranche
- newDeposited: new deposits pending for the next vault
- newInvested: from newDeposited, how much was invested

Note that deposited >= invested. The excess deposits, if any, are
deposited - invested. 

*newRollover*

A creator can define a new Rollover product. 

*createAndAddNextVault*
*addNextVault*

Both of these are ways a creator can setup the next Vault for a
Rollover to invest in. Investors can check whether they like the terms
of the next product to continue in the Rollover. But if the hurdle
rate is set to 1%, for example, some investors may wish to exit.

*deposit*

Deposit tokens into a queue to invest into tranche of this
Rollover. Deposits are not gauranteed to get in.

*claim* 

Once a Rollover is invested in a Vault, this will return unused
deposits and Rollover tranche tokens.

*withdraw*

Investors exit a Rollover by getting tranche tokens in the underlying
Vault, plus a share of any uninvested excess capital.

*migrate*

Strategist triggers this function to withdraw funds from the current
Vault. Then it invest those funds plus any new deposits into the next
Vault.

**Integration between RolloverVault and AllPairVault**

Currently RolloverVault is tightly integrated with the AllPairVault
contract. This is because the Rollover has some special privileges
beyond a normal depositor in a Vault. Rollover jumps to the head of
the queue of depositors. The Rollover withdraws from one vault and
invests in the next in a single transaction. There's no waiting time
to get in. 

*migrate*

At a high-level, migrate withdraws funds from a vault and invests in
the next vault. A lot is happening in this function. The first half
calls `redeem` on the vault to remove liquidity. Then it withdraws
funds from both tranches and adjusts the internal bookkeeping for this
round.

To start the investment process, Rollover calls `depositFromRollover`
on the vault to push all available funds to the front of the deposit
queue. One advantage is if the Rollover is out-of-balance, it may find
more deposits directly to the vault that can help balance it. Next,
Rollover calls `rolloverClaim` to fetch all the tranche tokens from
the vault for both sides. Again, some more booking happens for the new
round. 

-----

**Strategies**

The strategies are in charge of investing and redeeming large pools of
capital for specific investment vehicles. Some investments will offer
incentives, which must be accounted for properly. 

Each AMM will have a corresponding strategy contract. The interface
`IStrategy` exposes a few functions.

*invest*

Given two assets, the invest method will buy as much LP tokens as
possible at the current ratio between the assets on the AMM. However,
it is very likely the two tranches will not be balanced at that ratio
(which is unknown when investors are depositing funds). Therefore,
there will likely be some excess uninvested funds for 1 tranche.

*withdrawExcess*

Transfer any unused deposits back to the investor. 

*redeem*

This function is more complicated because it also contains the logic
for paying off the tranches according to the hurdle rate. The first
step is to remove the LP tokens from the AMM and determine how much of
each asset has been received. In addition, for Sushiswap we also
redeem any incentives earned for providing liquidity. There are
several possible outcomes:

- If the senior tranche now exceeds the amount expected after the
  hurdle rate, then any excess senior assets are swapped and given to
  the junior tranche.
- If the senior tranche is below the expected amount, then we convert
  some or all of the junior tokens to compensate the senior investors.

In the worst case, the returns are so low that the junior tranche is
wiped out and the senior tranche still suffers a loss. Crypto is not
for the faint of heart!

*addLp*
*removeLp*

This will add/remove LP from strategy's account and adjust the number
of total shares available to investors For example, if the strategy is
holding 90 LP then there are 90 shares. If someone adds 10 LP, then
they will get back 10 shares and the total shares is 100. They own 10%
of the LP pool. 


**UniSwapStrategy**

This strategy is the simplest because UniSwap doesn't offer much
incentives anymore. For invest it simply calls `addLiquidity`. To
redeem it calls `removeLiquidity`. However, some additional
bookkeeping is involved to handle mid-duration deposits and removal of
LP tokens.

**SushiStrategyLP**

Mostly the same as UniSwap since Sushi forked their code. However,
Sushi added features for additional incentives, e.g. Sushi and
xSushi. This strategy has an additional method `harvest` to
occasionally convert earned Sushi into a balance of senior and junior
assets to reinvest into LP tokens. Of course, those LP tokens are
placed into Masterchef, which earns Sushi, that is again harvested to
reinvest into LP tokens. The cycle continues.

-----

***Additional Implementation Notes***

**Registry**

A global resource for variables, flags and roles. 

*Roles*

There are 9 access control roles defined for Ondo:

- Governance: This is the admin for most other roles, and has control
  over some functionality. We will be using a DAO for governance.
  
- Panic: This role can only turn on a global or local pause. The
  global pause is in the Registry. The local pause is managed per file
  with OZ's Pausable interface. 
  
- Guardian: This could be a multi-sig contract. In charge of toggling
  the pause off, rescuing tokens in case of a hack, 

- Creator: Allowed to create new Rollover and Vault products. 

- Strategist: Allowed to call most of the functions that move product
  states forward. One day this could be a bot or Keep3r. For now
  assume it is a trusted party, likely the Creator. 

- Deployer: The admin for the following roles. While this could also
  be the DAO or a multi-sig account, we felt having this allowed some
  seperation from pure governance issues. For example, we could grant
  another team the deployer role, giving them the ability to create
  strategies independently of Ondo. 

- Vault: Assigned to AllPairVault

- Rollover: Assigned to RolloverVault

- Strategy: Assigned to all strategy contracts.


**OndoLibrary**

Contains some common variables and functions used across files. 

*States*

The state transition for AllPairVault is strictly linear. 
- Inactive: the vault does not yet accept deposits. It allows us to
  perform any additional setup before startTime for the vault. 
- Deposit: Now deposits are allowed.
- Live: Deposits are no longer allowed. The vault is invested. The
  strategist can call `harvest`. Users can deposit/withdraw LP
  tokens. 
- Withdraw: The vault has redeemed the investment. Users can now
  withdraw their funds from the vault. 

*getInvestedAndExcess*

For a specific user, calculate how much of their deposits actually got
in given the total invested amount. 

Let's say DAI/ETH has a ratio of 2500/1. Alice deposits a total of
$100. At the moment the Strategist invests the funds it discovers
there's too much deposited DAI, i.e. 3000/1. There are 3 alternatives
for Alice: (1) all $100 got in, (2) none got in, (3) a partial amount
got in. In (2) and (3) Alice can immediately claim her DAI back since
they will not be used by the product.

If we used a normal language with plenty of RAM, we could store all
deposits in a single queue and quickly determine who got in to the
Vault. Imagine Alice, Bob, Cindy, and Doug make a series of deposits
in DAI: 

[A:10, B:100, A:50, C: 1000, A:35, D: 50, B: 200, A:5, ...]

Then we add up the deposits and credit each person until we hit
$2500. Everyone after that did not get in. Unfortunately this would
not be practical on the EVM.

To determine this efficiently, we use a series of running, or prefix,
sums. Let's say Alice deposits DAI amounts $10, $50, $35, $5 in
sequence during the open deposit period. We maintain two arrays per
user. A prefix sum of Alice's deposits: [10, 60, 95, 100]. And a
prefix sum of total deposits from all users at the moment Alice
deposits (including her deposit): [350, 1500, 2200, 2800]. When we
invest, we know that $2500 got in. So we search the user sums array to
find that position 3 ($2800) is greater than $2500. Position 2 is
$2200, so position 2 in Alice's array is $95, which means the last $5
did not get invested. Alice can claim that $5 after the Vault has
invested

**TrancheToken**

A fairly simple ERC20 contract to manage tokens representing vault
tranches and rollover tranches. We expect to create lots of these for
vaults. Therefore, we are cloning this implementation to save on
gas. These token contracts can be paused by the the global
registry. Only the vault can mint/burn tokens.


**SampleFeeCollector**

[This contract should be in test/] This is not a real contract for
performanceFee collection. It is an example of the integration between
AllPairVault and another contract to handle fee distribution. 

**Ondo token**

A slightly modified version of the governance token from Compound. 

**StackingPools**

A modified version of MasterChef v1 from Sushiswap. The primary
difference is MasterChef mints tokens to grant to pools. Instead, we
will pre-allocate tokens to the contract. In addition, we've removed
the developer fee that was taken from each distribution. Also adjusted
the permissioning to use the Registry contract. 

**DAO**

A modified version of Compound's Governor Bravo DAO (commit
b9b1403). Specifically, we don't need the integration with
GovernorAlpha. All that has been removed. 

