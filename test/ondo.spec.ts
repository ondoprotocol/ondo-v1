import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { Ondo } from "../typechain";

use(solidity);

const setupTest = (preEnableTransfer: boolean = false) => {
  return deployments.createFixture(async ({ deployments, ethers }) => {
    await deployments.fixture("Ondo"); // ensure you start from a fresh deployments
    const ondo: Ondo = await ethers.getContract("Ondo");
    if (preEnableTransfer) {
      await ondo.enableTransfer();
    }
    let signers = await ethers.getSigners();
    return {
      ondo,
      signers,
      accounts: signers.map((s) => s.address),
      chainId: await signers[0].getChainId(),
    };
  })();
};

describe("Ondo", () => {
  let signers: SignerWithAddress[];
  let accounts: string[];
  let ondo: Ondo;
  let chainId: number;

  beforeEach(async () => {
    const setup = await setupTest(true);
    ondo = setup.ondo;
    signers = setup.signers;
    accounts = setup.accounts;
    chainId = setup.chainId;
  });

  describe("metadata", () => {
    it("has a name", async () => {
      expect(await ondo.name()).to.equal("Ondo");
    });
    it("has a symbol", async () => {
      expect(await ondo.symbol()).to.equal("ONDO");
    });
  });

  describe("balanceOf", () => {
    it("grants to initial account", async () => {
      expect(await ondo.balanceOf(accounts[0])).to.equal(
        "10000000000000000000000000000"
      );
    });
  });

  describe("delegateBySig", () => {
    const Domain = (ondo: Ondo) => ({
      name: "Ondo",
      chainId,
      verifyingContract: ondo.address,
    });
    const Types = {
      Delegation: [
        { name: "delegatee", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
      ],
    };

    it("reverts if the signatory is invalid", async () => {
      const delegatee = accounts[0],
        nonce = 0,
        expiry = 0;
      await expect(
        ondo.delegateBySig(
          delegatee,
          nonce,
          expiry,
          0,
          "0x16670ca66adef3714742563ad0c7475358e93ae23ee6adb1f8a5c0dce6ae88a3",
          "0x16670ca66adef3714742563ad0c7475358e93ae23ee6adb1f8a5c0dce6ae88a3"
        )
      ).revertedWith("Ondo::delegateBySig: invalid signature");
    });

    it("reverts if the nonce is bad ", async () => {
      const delegatee = accounts[0],
        nonce = 1,
        expiry = 0;
      let signed = await signers[0]._signTypedData(Domain(ondo) as any, Types, {
        delegatee,
        nonce,
        expiry,
      });
      let sig = ethers.utils.splitSignature(signed);
      //   const { v, r, s } = EIP712.sign(
      //     Domain(comp),
      //     "Delegation",
      //     { delegatee, nonce, expiry },
      //     Types,
      //     unlockedAccount(a1).secretKey
      //   );
      await expect(
        ondo.delegateBySig(delegatee, nonce, expiry, sig.v, sig.r, sig.s)
      ).revertedWith("Ondo::delegateBySig: invalid nonce");
    });

    it("reverts if the signature has expired", async () => {
      const delegatee = accounts[0],
        nonce = 0,
        expiry = 0;
      let signed = await signers[0]._signTypedData(Domain(ondo) as any, Types, {
        delegatee,
        nonce,
        expiry,
      });
      let sig = ethers.utils.splitSignature(signed);
      //   const { v, r, s } = EIP712.sign(
      //     Domain(comp),
      //     "Delegation",
      //     { delegatee, nonce, expiry },
      //     Types,
      //     unlockedAccount(a1).secretKey
      //   );
      await expect(
        ondo.delegateBySig(delegatee, nonce, expiry, sig.v, sig.r, sig.s)
      ).revertedWith("Ondo::delegateBySig: signature expired");
      //   await expect(
      //     send(comp, "delegateBySig", [delegatee, nonce, expiry, v, r, s])
      //   ).rejects.toRevert("revert Comp::delegateBySig: signature expired");
    });

    it("delegates on behalf of the signatory", async () => {
      const delegatee = accounts[0],
        nonce = 0,
        expiry = 10e9;
      let signed = await signers[0]._signTypedData(Domain(ondo) as any, Types, {
        delegatee,
        nonce,
        expiry,
      });
      let sig = ethers.utils.splitSignature(signed);
      //   const { v, r, s } = EIP712.sign(
      //     Domain(comp),
      //     "Delegation",
      //     { delegatee, nonce, expiry },
      //     Types,
      //     unlockedAccount(a1).secretKey
      //   );
      expect(await ondo.delegates(accounts[0])).to.equal(
        ethers.constants.AddressZero
      );

      const tx = await (
        await ondo.delegateBySig(delegatee, nonce, expiry, sig.v, sig.r, sig.s)
      ).wait();
      expect(tx.gasUsed < BigNumber.from(80000));
      expect(await ondo.delegates(accounts[0])).to.equal(signers[0].address);
    });
  });

  describe("numCheckpoints", () => {
    it("returns the number of checkpoints for a delegate", async () => {
      let guy = signers[1];
      await ondo.transfer(guy.address, "100"); //give an account a few tokens for readability
      expect(await ondo.numCheckpoints(accounts[0])).to.equal(0);

      const t1 = await ondo.connect(guy).delegate(accounts[0]);
      expect(await ondo.numCheckpoints(accounts[0])).to.equal(1);

      const t2 = await ondo.connect(guy).transfer(accounts[2], 10);
      expect(await ondo.numCheckpoints(accounts[0])).to.equal(2);

      const t3 = await ondo.connect(guy).transfer(accounts[2], 10);
      expect(await ondo.numCheckpoints(accounts[0])).to.equal(3);

      const t4 = await ondo.transfer(guy.address, 20);
      expect(await ondo.numCheckpoints(accounts[0])).to.equal(4);

      expect((await ondo.checkpoints(accounts[0], 0))[1]).to.equal(
        BigNumber.from(100)
      );

      expect((await ondo.checkpoints(accounts[0], 1))[1]).to.equal(
        BigNumber.from(90)
      );

      expect((await ondo.checkpoints(accounts[0], 2))[1]).to.equal(
        BigNumber.from(80)
      );

      expect((await ondo.checkpoints(accounts[0], 3))[1]).to.equal(
        BigNumber.from(100)
      );
    });
  });

  describe("Ondo transfer disabled", () => {
    beforeEach(async () => {
      const setup = await setupTest();
      ondo = setup.ondo;
      signers = setup.signers;
      accounts = setup.accounts;
      chainId = setup.chainId;
    });

    it("transfer reverts when transfers are disabled", async () => {
      expect(await ondo.transferAllowed()).to.equal(false);
      // signer[1] doesnt have owner permission, only signer[0] has it
      await expect(
        ondo.connect(signers[1]).transfer(accounts[1], 0)
      ).to.be.revertedWith(
        "OndoToken: Transfers not allowed or not right privillege"
      );
    });

    it("account with owner permission can transfer", async () => {
      expect(await ondo.transferAllowed()).to.equal(false);
      expect(await ondo.balanceOf(accounts[1])).to.equal(0);
      await ondo.connect(signers[0]).transfer(accounts[1], 1);
      expect(await ondo.balanceOf(accounts[1])).to.equal(1);
    });

    it("transferAllowed works correctly", async () => {
      expect(await ondo.transferAllowed()).to.equal(false);
      await ondo.enableTransfer();
      expect(await ondo.transferAllowed()).to.equal(true);
    });
  });
});
