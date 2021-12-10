import { BigNumber } from "bignumber.js";
import { exit } from "process";

export const exitIf = (condition: boolean, log: string) => {
  if (condition) {
    console.log(log);
    exit();
  }
};

export const convertAmountString = (amount: string) => {
  return new BigNumber(amount).toString(10);
};
