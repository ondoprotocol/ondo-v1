#!/usr/bin/env node

// make sourcemaps work!
require("source-map-support").install();
require("dotenv").config();
var pkg = require("ganache-cli/package");
var { toChecksumAddress, BN } = require("ethereumjs-util");
var ganache;
try {
  ganache = require("ganache-cli/lib");
} catch (e) {
  ganache = require("ganache-cli/build/ganache-core.node.cli.js");
}
var to = ganache.to;

var detailedVersion =
  "Ganache CLI v" + pkg.version + " (ganache-core: " + ganache.version + ")";

var isDocker =
  "DOCKER" in process.env && process.env.DOCKER.toLowerCase() === "true";
// var argv = initArgs(yargs, detailedVersion, isDocker).argv;

function parseAccounts(accounts) {
  function splitAccount(account) {
    account = account.split(",");
    return {
      secretKey: account[0],
      balance: account[1],
    };
  }

  if (typeof accounts === "string") return [splitAccount(accounts)];
  else if (!Array.isArray(accounts)) return;

  var ret = [];
  for (var i = 0; i < accounts.length; i++) {
    ret.push(splitAccount(accounts[i]));
  }
  return ret;
}

// if (argv.d) {
//   argv.s = "TestRPC is awesome!"; // Seed phrase; don't change to Ganache, maintain original determinism
// }

// if (typeof argv.unlock == "string") {
//   argv.unlock = [argv.unlock];
// }

var logger = console;

// // If quiet argument passed, no output
// if (argv.q === true) {
//   logger = {
//     log: function() {},
//   };
// }

// // If the mem argument is passed, only show memory output,
// // not transaction history.
// if (argv.mem === true) {
//   logger = {
//     log: function() {},
//   };

//   setInterval(function() {
//     console.log(process.memoryUsage());
//   }, 1000);
// }
var options = {
  port: 8545,
  hostname: "127.0.0.1",
  debug: false,
  total_accounts: 10,
  default_balance_ether: 100,
  gasPrice: 20000000000,
  gasLimit: 6721975,
  callGasLimit: 9007199254740991,
  fork: process.env.MAINNET_RPC_URL,
  forkCacheSize: 1073741824,
  hardfork: "muirGlacier",
  verbose: false,
  secure: false,
  db_path: ".ganache-db",
  mnemonic: process.env.MNEMONIC,
  account_keys_path: null,
  vmErrorsOnRPCResponse: true,
  logger: console,
  allowUnlimitedContractSize: false,
  keepAliveTimeout: 5000,
};

var server = ganache.server(options);

// console.log(detailedVersion);

let started = false;
process.on("uncaughtException", function (e) {
  if (started) {
    console.log(e);
  } else {
    console.log(e.stack);
  }
  process.exit(1);
});

// See http://stackoverflow.com/questions/10021373/what-is-the-windows-equivalent-of-process-onsigint-in-node-js
if (process.platform === "win32") {
  require("readline")
    .createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    .on("SIGINT", function () {
      process.emit("SIGINT");
    });
}

const closeHandler = function () {
  // graceful shutdown
  server.close(function (err) {
    if (err) {
      // https://nodejs.org/api/process.html#process_process_exit_code
      // writes to process.stdout in Node.js are sometimes asynchronous and may occur over
      // multiple ticks of the Node.js event loop. Calling process.exit(), however, forces
      // the process to exit before those additional writes to stdout can be performed.
      if (process.stdout._handle) process.stdout._handle.setBlocking(true);
      console.log(err.stack || err);
      process.exit();
    } else {
      process.exit(0);
    }
  });
};

process.on("SIGINT", closeHandler);
process.on("SIGTERM", closeHandler);
process.on("SIGHUP", closeHandler);

function startGanache(err, result) {
  if (err) {
    console.log(err);
    return;
  }
  started = true;
  var state = result ? result : server.provider.manager.state;

  console.log("");
  console.log("Available Accounts");
  console.log("==================");

  var accounts = state.accounts;
  var addresses = Object.keys(accounts);
  var ethInWei = new BN("1000000000000000000");

  addresses.forEach(function (address, index) {
    var balance = new BN(accounts[address].account.balance);
    var strBalance = balance.divRound(ethInWei).toString();
    var about = balance.mod(ethInWei).isZero() ? "" : "~";
    var line = `(${index}) ${toChecksumAddress(
      address
    )} (${about}${strBalance} ETH)`;

    if (state.isUnlocked(address) == false) {
      line += " 🔒";
    }

    console.log(line);
  });

  console.log("");
  console.log("Private Keys");
  console.log("==================");

  addresses.forEach(function (address, index) {
    console.log(
      "(" + index + ") " + "0x" + accounts[address].secretKey.toString("hex")
    );
  });

  if (options.account_keys_path != null) {
    console.log("");
    console.log("Accounts and keys saved to " + options.account_keys_path);
  }

  if (options.accounts == null) {
    console.log("");
    console.log("HD Wallet");
    console.log("==================");
    console.log("Mnemonic:      " + state.mnemonic);
    console.log("Base HD Path:  " + state.wallet_hdpath + "{account_index}");
  }

  if (options.gasPrice) {
    console.log("");
    console.log("Gas Price");
    console.log("==================");
    console.log(options.gasPrice);
  }

  if (options.gasLimit) {
    console.log("");
    console.log("Gas Limit");
    console.log("==================");
    console.log(options.gasLimit);
  }

  if (options.callGasLimit) {
    console.log("");
    console.log("Call Gas Limit");
    console.log("==================");
    console.log(options.callGasLimit);
  }

  if (options.fork) {
    console.log("");
    console.log("Forked Chain");
    console.log("==================");
    console.log("Location:       " + state.blockchain.options.fork);
    console.log(
      "Block:          " + to.number(state.blockchain.forkBlockNumber)
    );
    console.log("Network ID:     " + state.net_version);
    console.log(
      "Time:           " + (state.blockchain.startTime || new Date()).toString()
    );
    let maxCacheSize;
    if (options.forkCacheSize === -1) {
      maxCacheSize = "∞";
    } else {
      maxCacheSize = options.forkCacheSize + " bytes";
    }
    console.log("Max Cache Size: " + maxCacheSize);
  }

  console.log("");
  console.log("Listening on " + options.hostname + ":" + options.port);
}

server.listen(options.port, options.hostname, startGanache);
