import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use } from "chai";
import Decimal from "decimal.js";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { IUniswapV2Router02, UniPull, UniPull__factory } from "../typechain";
import { addresses } from "./utils/addresses";
import { UniPoolMock } from "./utils/uni";

use(solidity);

const e18 = new Decimal(10).pow(18);

describe("Uni", () => {
  let uniRouter: IUniswapV2Router02;
  let signers: SignerWithAddress[];
  let signer: SignerWithAddress;
  let uniPool: UniPoolMock;
  let accounts: string[];
  let uniPull: UniPull;
  before(async function () {
    signers = await ethers.getSigners();
    accounts = signers.map((x) => x.address);
    signer = signers[0];
    uniRouter = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      signer
    );
    const uniPullFactory = new UniPull__factory(signer);
    uniPull = await uniPullFactory.deploy(await uniRouter.factory());
  });
  it("test create mock", async function () {
    const amt = e18.times(100000);
    uniPool = await UniPoolMock.createMock(
      signer,
      addresses.uniswap.router,
      0,
      0
    );
    const _signers = signers.slice(1, 5);
    for (const signer of _signers) {
      await uniPool.mintAndAdd(
        amt.times(2).toFixed(0),
        amt.times(4).toFixed(0),
        signer
      );
    }
    const bal = await uniPool.pool.balanceOf(signers[1].address);
    expect(bal.toString()).not.eq("0");
  });
  it("test uniPull", async function () {
    const amt = e18.times(1000);
    let signer = signers[1];
    const balance = await uniPool.pool.balanceOf(signer.address);
    await uniPool.pool.connect(signer).transfer(uniPull.address, balance);
    const amt0 = e18.times(5).toFixed(0);
    const amt1 = e18.times(3).toFixed(0);
    await uniPull.connect(signer).migrate2(uniPool.pool.address, amt0, amt1);
    expect(await uniPool.token0.balanceOf(signer.address)).eq(amt0);
    expect(await uniPool.token1.balanceOf(signer.address)).eq(amt1);
  });
  // it("test mock mintAddLiquidity", async function () {
  //   const amt = e18.times(100000).toFixed();
  //   const bal = await uniPool.pool.balanceOf(uniPool.minterAddress);
  //   await uniPool.mintAndAdd(amt, amt);
  //   const newbal = await uniPool.pool.balanceOf(uniPool.minterAddress);
  //   expect(newbal.gt(bal)).to.eq(true);
  // });
  // it("test mock addReserves as analogue for fees", async function () {
  //   let bal = await uniPool.pool.balanceOf(uniPool.minterAddress);
  //   let amt = bal.div(2);
  //   const received = await uniPool.removeLiquidity(amt);
  //   await uniPool.addLiquidity(received[0], received[1]);
  //   bal = await uniPool.pool.balanceOf(uniPool.minterAddress);
  //   amt = bal.div(2);
  //   await uniPool.addFees(10000);
  //   const newreceived = await uniPool.removeLiquidity(amt);
  //   // 100% return => 2x
  //   expect(
  //     _.zip(newreceived, received).every(([rnew, rold]) =>
  //       rnew!.div(rold!).eq(2)
  //     )
  //   );
  // });
});
