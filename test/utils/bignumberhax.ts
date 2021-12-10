import Decimal from "decimal.js";
import { BigNumber } from "ethers";
import { BigNumber as EPBN } from "@ethersproject/bignumber";

declare global {
  interface Promise<T> {
    toD: T extends BigNumber ? () => Promise<Decimal> : never;
  }
}

declare module "ethers" {
  interface BigNumber {
    toD(): Decimal;
  }
}

declare module "@ethersproject/bignumber" {
  interface BigNumber {
    toD(): Decimal;
  }
}

declare module "decimal.js" {
  interface Decimal {
    toBn(): BigNumber;
  }
}

BigNumber.prototype.toD = function toD() {
  return new Decimal(this.toString());
};

EPBN.prototype.toD = function toD() {
  return new Decimal(this.toString());
};

Decimal.prototype.toBn = function toBn() {
  return BigNumber.from(this.toFixed(0));
};

Promise.prototype.toD = function toD() {
  return this.then((x: any) => x.toD());
};

(<any>BigNumber.prototype)[
  Symbol.for("nodejs.util.inspect.custom")
] = function inspect() {
  return this.toString();
};

(<any>EPBN.prototype)[
  Symbol.for("nodejs.util.inspect.custom")
] = function inspect() {
  return this.toString();
};

(<any>Decimal.prototype)[
  Symbol.for("nodejs.util.inspect.custom")
] = function inspect() {
  return this.toFixed(0);
};
