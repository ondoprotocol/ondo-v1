import { expect } from "chai";
import { createVault } from "../../../scripts/utils/helpers";
import { ethers, deployments } from "hardhat";
import { BigNumber } from "ethers";
import Decimal from "decimal.js";
import * as logger from "../../utils/logger";
import { mainnet } from "../../../scripts/utils/addresses";

let harvestAt: number;
let investAt: number;
let createAt: number;
let vaultId: BigNumber;
const { provider } = ethers;
const e18 = new Decimal(10).pow(18);
const stre18 = e18.toFixed(0);

//this file should eventually test all the core features of the vault
export function shouldBehaveLikeVaultDuringInvestmentSetup() {
  it("should allow Creator to create vault", async function () {
    ({ investAt, id: vaultId } = await createVault(
      this.vault,
      this.vaultParams,
      this.signers[0]
    ));
    this.investAt = investAt;
    this.vaultId = vaultId;
    await provider.send("evm_mine", [this.vaultParams.startTime]);
  });
  it("should NOT allow any one other than creator to create vault", async function () {
    await expect(
      createVault(this.vault, this.vaultParams, this.signers[1])
    ).to.be.revertedWith("Unauthorized");
  });
  it("should allow investors to deposit assets in the junior tranche when with in the user and tranche cap", async function () {
    logger.debug(
      `Deposit Block time: ${new Date(
        (await provider.getBlock("latest")).timestamp * 1000
      ).toISOString()}`
    );
    //signers 0,1,2 investing in junior tranche
    for (let i = 0; i < 3; i++) {
      if ((await this.juniorTokenContract.address) === mainnet.assets.weth) {
        await this.vault.connect(this.signers[i]).depositETH(this.vaultId, 1, {
          value: ethers.utils.parseEther(
            this.ethInvestmentPerInvestor.toString()
          ),
        });
        logger.debug(
          `Depositing ${
            this.ethInvestmentPerInvestor
          } ${await this.juniorTokenContract.symbol()} for signer ${i} using depositETH function`
        );
      } else {
        const juniorTokenBalance = await this.juniorTokenContract.balanceOf(
          this.accounts[i]
        );
        await this.juniorTokenContract
          .connect(this.signers[i])
          .approve(this.vault.address, juniorTokenBalance);
        logger.debug(
          `Depositing ${ethers.BigNumber.from(juniorTokenBalance).div(
            stre18
          )} ${await this.juniorTokenContract.symbol()} for signer ${i}`
        );
        await this.vault
          .connect(this.signers[i])
          .deposit(this.vaultId, 1, juniorTokenBalance);
      }
    }
  });
  it("should allow investors to deposit assets in the senior tranche when with in the user and tranche cap", async function () {
    //signers 3,4,5 investing in senior tranche
    for (let i = 3; i < 6; i++) {
      if ((await this.seniorTokenContract.address) === mainnet.assets.weth) {
        await this.vault.connect(this.signers[i]).depositETH(this.vaultId, 0, {
          value: ethers.utils.parseEther(
            this.ethInvestmentPerInvestor.toString()
          ),
        });
        logger.debug(
          `Deposited ${
            this.ethInvestmentPerInvestor
          } ${await this.seniorTokenContract.symbol()} for signer ${i} using depositETH function`
        );
      } else {
        const seniorTokenBalance = await this.seniorTokenContract.balanceOf(
          this.accounts[i]
        );
        await this.seniorTokenContract
          .connect(this.signers[i])
          .approve(this.vault.address, seniorTokenBalance);
        logger.debug(
          `Depositing ${ethers.BigNumber.from(seniorTokenBalance).div(
            this.srDecimalsFactor
          )} ${await this.seniorTokenContract.symbol()} for signer ${i}`
        );
        await this.vault
          .connect(this.signers[i])
          .deposit(this.vaultId, 0, seniorTokenBalance);
      }
    }
  });
  it("should not allow strategist to invest before the investAt time", async function () {
    await expect(this.vault.invest(this.vaultId, 0, 0)).to.be.revertedWith(
      "Not time yet"
    );
  });
  it("should not allow investors to deposit assets when exceeds usercap for the tranche", async function () {});
  it("should not allow investors to deposit assets in the live vault", async function () {});
  it("should allow investors to claim uninvested asset plus tranche tokens for the corresponding asset", async function () {});
  it("should not return tranche tokens on claim if enableTokens flag is disabled", async function () {});
  it("should allow investors to deposit ETH into Active vault only if the tranche is WETH", async function () {});
  it("should allow investors to claim ETH though the vault asset is WETH", async function () {});
  it("should allow performance fee to be set and changed by strategist on inactive vaults only", async function () {});
  it("should not allow performance fee to be more than a predetermined amount", async function () {});
  //***************view functions************
  it("should be able to retrieve vault for specific vault index or a range of vault indexes", async function () {});
  it("should be able to retrieve vault for specific trancheToken address", async function () {});
  it("should be able to retrieve expected senior amount for the vault", async function () {});
  it("should be able to retrieve correct usercaps set in the vault", async function () {});
  it("should be able to retrieve all the correct details of vault investor like position, claimable and withdrawable balances, excess", async function () {});
}
