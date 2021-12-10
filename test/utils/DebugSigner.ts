import { Signer, Wallet } from "ethers";
import { Deferrable } from "ethers/lib/utils";
import {
  TransactionRequest,
  TransactionResponse,
} from "@ethersproject/providers";
import DebugUtils from "@truffle/debug-utils";

type Constructor<T> = new (...args: any[]) => T;

type SignerType = Constructor<Signer>;

type DebugSignerType<T extends SignerType> = new (
  bugger: any,
  ...args: ConstructorParameters<T>
) => InstanceType<T> & { bugger: any };

function createDebugSigner<T extends SignerType>(
  _Signer: T
): DebugSignerType<T> {
  // : DebugSignerType<T>
  return class DebugSigner extends (_Signer as any) {
    public bugger?: any;
    constructor(...args: any[]) {
      super(...args.slice(1));
      this.bugger = args[0];
    }
    async sendTransaction(
      transaction: Deferrable<TransactionRequest>
    ): Promise<TransactionResponse> {
      (<Signer>(<unknown>this))._checkProvider("sendTransaction");
      const originalStackTrace = new Error().stack!;
      return super.sendTransaction(transaction).catch(async (e: any) => {
        if (
          !e ||
          typeof e !== "object" ||
          !("transactionHash" in e) ||
          !this.bugger
        ) {
          throw e;
        }
        await this.bugger.load(e.transactionHash);
        await this.bugger.continueUntilBreakpoint();
        const report = this.bugger.stacktrace();
        await this.bugger.unload();
        const solidityStackTrace = await DebugUtils.formatStacktrace(report, 4);
        let isDeploy = false;
        const initialLinesRegexp = isDeploy
          ? /^.*\n.*\n.*\n.*/ //first 4 lines (note . does not include \n)
          : /^.*\n.*\n.*/;
        try {
          let stackTrace = originalStackTrace.replace(
            initialLinesRegexp,
            e.stack.split("\n")[0]
          );
          if (solidityStackTrace) {
            //let's split the solidity stack trace into first line & rest
            let [
              _,
              solidityFirstLine,
              solidityRemaining,
            ] = solidityStackTrace.match(/^(.*?)\r?\n((.|\r|\n)*)$/);

            stackTrace = stackTrace.replace(
              /^.*/, //note that . does not include \n
              solidityRemaining //note: this does not end in \n, so no modification needed
            );
            e.hijackedMessage = e.message;
            e.message = solidityFirstLine;
          }

          e.hijackedStack = e.stack;
          e.stack = stackTrace;
        } catch (_e) {
          //again, ignore errors
          //(not sure how this can happen here but I'll leave this block here)
        }
        throw e;
      });
    }
  } as any;
}

export { createDebugSigner };
