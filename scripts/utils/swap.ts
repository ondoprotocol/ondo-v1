import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { getAddress } from "../utils/helpers";

export type SWAP_PARAMS = {
  hre: HardhatRuntimeEnvironment;
  user: SignerWithAddress;
  router: string;
  from: string;
  to: string;
  path: string[];
  amount: string;
};

export const ETH = "0x0000000000000000000000000000000000000000";

export const swap = async ({
  hre,
  user,
  router,
  from,
  to,
  path,
  amount,
}: SWAP_PARAMS) => {
  const ethers = hre.ethers;
  const address = getAddress(hre);
  const routerContract = await ethers.getContractAt(
    "IUniswapV2Router02",
    router
  );
  const deadline: number =
    (await ethers.provider.getBlock("latest")).timestamp + 1000;

  if (from === ETH) {
    // update path
    if (path.length == 0) {
      path = [address.assets.weth, to];
    }

    // swap tokens
    await routerContract
      .connect(user)
      .swapExactETHForTokens(0, path, user.address, deadline, {
        value: amount,
      });
  } else if (to === ETH) {
    // approve
    const fromToken = await ethers.getContractAt("IERC20", from);
    await fromToken.connect(user).approve(router, amount);

    // update path
    if (path.length == 0) {
      path = [from, address.assets.weth];
    }

    // swap tokens
    await routerContract
      .connect(user)
      .swapExactTokensForETH(amount, 0, path, user.address, deadline);
  } else {
    // approve
    const fromToken = await ethers.getContractAt("IERC20", from);
    await fromToken.connect(user).approve(router, amount);

    // update path
    if (path.length == 0) {
      path = [from, to];
    }

    // swap tokens
    await routerContract
      .connect(user)
      .swapExactTokensForTokens(amount, 0, path, user.address, deadline);
  }
};
