import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { mainnet } from "../../../scripts/utils/addresses";
import { shouldBehaveLikeAUniswapStrategyDuringHarvestAndRedeem } from "./vaultHarvestAndRedeem";
import { shouldBehaveLikeVaultDuringInvestmentSetup } from "./vaultInvestment";
import * as logger from "../../utils/logger";
import { shouldBehaveLikeVaultDuringMidtermDeposits } from "./vaultMidtermdeposits";
import { shouldAllowEmergencyRescue } from "./emergencyRescueToStrategy";
use(solidity);

export async function shouldBehaveLikeVault(
  vaultName: string,
  deploymentValidator: Function,
  shouldBehaveLikeVaultDuringInvestments: Function
): Promise<void> {
  describe(`${vaultName} - deployment validation`, async function () {
    deploymentValidator();
    describe(`${vaultName} - vault lifecycle`, async function () {
      shouldBehaveLikeVaultDuringInvestmentSetup();
      describe(`${vaultName} vault behaviour - invest`, async function () {
        shouldBehaveLikeVaultDuringInvestments();
        describe(`${vaultName} vault behaviour - harvest and redeem`, async function () {
          shouldBehaveLikeAUniswapStrategyDuringHarvestAndRedeem();
          describe(`${vaultName} mid term deposits`, async function () {
            shouldBehaveLikeVaultDuringMidtermDeposits();
            describe(`${vaultName} emergency withdraw from Uniswap`, async function () {
              shouldAllowEmergencyRescue();
            });
          });
        });
      });
    });
  });
}
