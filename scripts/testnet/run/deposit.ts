import { deposit } from "./token-deploy";
import * as ids from "../../../deployed/vault-id.json";
import { BigNumber } from "ethers";

deposit(
  BigNumber.from(
    "0xc4af9588cac942204dc62459da046f756a759d228e5136c7482512130a0a1111"
  )
);
