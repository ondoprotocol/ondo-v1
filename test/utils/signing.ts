import _ from "lodash";
import { PopulatedTransaction, Signer, Wallet, BigNumber } from "ethers";
import { Awaited, AsyncOrSync } from "ts-essentials";
import { Provider } from "@ethersproject/providers";
import { HDKey } from "ethereum-cryptography/hdkey";
import * as bip39 from "bip39";
import { createDebugSigner } from "./DebugSigner";

const DebugWallet = createDebugSigner(Wallet);

const sign_transactions = async (
  signer: Signer,
  txs: AsyncOrSync<PopulatedTransaction>[],
  nonce?: number
) => {
  if (!nonce) {
    nonce = await signer.getTransactionCount();
  }
  const address = await signer.getAddress();
  const _txs = await Promise.all(txs).then((txs) =>
    Promise.all(
      txs.map(
        async (tx, i): Promise<PopulatedTransaction> => ({
          ...tx,
          from: address,
          nonce: nonce! + i,
          gasLimit: tx.gasLimit || (await signer.estimateGas(tx)),
          gasPrice: tx.gasPrice || (await signer.getGasPrice()),
          chainId: tx.chainId || (await signer.getChainId()),
        })
      )
    )
  );
  return Promise.all(_txs.map((tx) => signer.signTransaction(tx)));
};

const send_transactions = async (
  provider: Provider,
  txs: AsyncOrSync<string[]>
) => {
  const _txs = await txs;
  return Promise.all(_txs.map((tx) => provider.sendTransaction(tx)));
};

const wait_for_confirmed = async (
  txrs: Awaited<ReturnType<typeof send_transactions>>,
  confirmations: number = 1
) => {
  return _.last(txrs)!.wait(confirmations);
};

const get_signers = async (mnemonic: string, provider: Provider) => {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed);
  const privKeys = [];
  for (let i = 0; i < 20; i++) {
    privKeys.push(hdkey.derive(`m/44'/60'/0'/0/${i.toString()}`));
  }
  return privKeys.map((x) => {
    return new Wallet(x.privateKey!, provider);
  });
};

const get_debug_signers = async (
  mnemonic: string,
  bugger: any,
  provider: Provider
) => {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed);
  const privKeys = [];
  for (let i = 0; i < 20; i++) {
    privKeys.push(hdkey.derive(`m/44'/60'/0'/0/${i.toString()}`));
  }
  return privKeys.map((x) => {
    return new DebugWallet(bugger, x.privateKey!, provider);
  });
};

export {
  get_debug_signers,
  sign_transactions,
  send_transactions,
  get_signers,
  wait_for_confirmed,
};
