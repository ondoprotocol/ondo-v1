import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { mainnet } from "../../scripts/utils/addresses";
import { shouldBehaveLikeDualRewardStrategyDuringHarvestAndRedeem } from "./vaultHarvestAndRedeem";
import { shouldBehaveLikeVaultDuringInvestments } from "./vaultInvestmentLifecycle";
import * as logger from "../utils/logger";
import { now } from "lodash";
import { shouldAllowEmergencyRescue } from "./emergencyRescueToStrategy";
import { shouldBehaveLikeVaultDuringMidtermDeposits } from "./vaultMidtermdeposits";
import { shouldAllowEmergencyRescueToEOA } from "./emergencyRescueToSigner";
use(solidity);

export async function shouldBehaveLikeVault(vaultName: string): Promise<void> {
  describe(`${vaultName} - vault lifecycle`, async function () {
    shouldBehaveLikeVaultDuringInvestments();
    describe(`${vaultName} vault behaviour - normal pool path`, async function () {
      shouldBehaveLikeDualRewardStrategyDuringHarvestAndRedeem();
      describe(`${vaultName} vault behaviour with different pool paths`, async function () {
        describe(`${vaultName} vault behaviour - pool path both Junior`, async function () {
          it(`should reset nonreward token pool path`, async function () {
            this.nonRewardTokenPath = [
              mainnet.sushi.token,
              this.vaultParams.seniorAsset,
              this.vaultParams.juniorAsset,
            ];
            await this.strategy.updateRewardPath(
              this.slp,
              this.nonRewardTokenPath
            );
          });
          shouldBehaveLikeDualRewardStrategyDuringHarvestAndRedeem();
          describe(`${vaultName} vault behaviour - pool path both Senior`, async function () {
            it("should reset reward token pool path", async function () {
              this.rewardTokenPath = [
                this.vaultParams.juniorAsset,
                this.vaultParams.seniorAsset,
              ];
              await this.strategy.updateRewardPath(
                this.slp,
                this.rewardTokenPath
              );
            });
            shouldBehaveLikeDualRewardStrategyDuringHarvestAndRedeem();
            describe(`${vaultName} mid term deposits`, async function () {
              shouldBehaveLikeVaultDuringMidtermDeposits();
              describe(`${vaultName} emergency withdraw to strategy`, async function () {
                shouldAllowEmergencyRescue();
                describe(`${vaultName} emergency withdraw to EOA account`, async function () {
                  shouldAllowEmergencyRescueToEOA();
                });
              });
            });
          });
        });
      });
    });
  });
}
