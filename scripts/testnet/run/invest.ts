import { invest } from "./token-deploy";
import * as ids from "../../../deployed/vault-id.json";
import { BigNumber } from "ethers";
import * as hre from "hardhat";

async function main() {
  if (hre.network.name == "hardhat" || "localhost") {
    await hre.ethers.provider.send("evm_mine", [
      (await hre.ethers.provider.getBlock("latest")).timestamp + 1000,
    ]);
  }
  invest(
    BigNumber.from(
      "0xb4a938cc2f8703b3a34d85f0460d7907e05ed5093ebb2bac91f008c84ad85773"
    )
  );
}

main();
