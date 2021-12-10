require("dotenv").config();
require("ts-node").register({ files: true });

module.exports = {
  // Uncommenting the defaults below
  // provides for an easier quick-start with Ganache.
  // You can also follow this format for other networks;
  // see <http://truffleframework.com/docs/advanced/configuration>
  // for more details on how to specify configuration options!
  //
  migrations_directory: "./migrations/migrations-ts",
  test_file_extension_regexp: /.*\.spec\.(js|ts|es|es6|jsx|sol)$/,
  compilers: {
    solc: {
      version: "0.8.2",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200000,
        },
      },
    },
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
  },
};
