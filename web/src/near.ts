import { NearConnector } from "@hot-labs/near-connect";
import { useEffect, useState } from "react";
import { NETWORK, RPC } from "./config";

const toBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** Read-only contract call straight against the RPC. No wallet needed. */
export async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contract,
        method_name: method,
        args_base64: toBase64(JSON.stringify(args)),
      },
    }),
  });
  const json = await res.json();
  const err = json.error?.data ?? json.error?.message ?? json.result?.error;
  if (err) throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(json.result.result)));
}

export const connector = new NearConnector({
  network: NETWORK,
  features: NETWORK === "testnet" ? { testnet: true } : undefined,
});

/**
 * Test hook, dev server only (stripped from production builds). A browser
 * automation script can inject an account and a send function so the real UI
 * can be driven end to end without a wallet popup (used to record the demo).
 */
interface InjectedSigner {
  accountId: string;
  send(tx: { receiverId: string; methodName: string; args: object; gas: string; deposit: string }): Promise<string>;
}
const injected: InjectedSigner | undefined = import.meta.env.DEV ? (window as unknown as { __tbSigner?: InjectedSigner }).__tbSigner : undefined;

export function useAccount(): string | null {
  const [account, setAccount] = useState<string | null>(injected?.accountId ?? null);
  useEffect(() => {
    if (injected) return;
    connector
      .getConnectedWallet()
      .then((c) => setAccount(c.accounts[0]?.accountId ?? null))
      .catch(() => setAccount(null));
    const onIn = (e: { accounts: { accountId: string }[] }) => setAccount(e.accounts[0]?.accountId ?? null);
    const onOut = () => setAccount(null);
    connector.on("wallet:signIn", onIn);
    connector.on("wallet:signOut", onOut);
    return () => {
      connector.off("wallet:signIn", onIn);
      connector.off("wallet:signOut", onOut);
    };
  }, []);
  return account;
}

export const TGAS = 1_000_000_000_000n;

export async function call(
  contract: string,
  method: string,
  args: object,
  opts: { deposit?: bigint; gas?: bigint } = {},
) {
  if (injected) {
    const error = await injected.send({ receiverId: contract, methodName: method, args, gas: (opts.gas ?? 30n * TGAS).toString(), deposit: (opts.deposit ?? 0n).toString() });
    if (error) throw new Error(error);
    return;
  }
  const wallet = await connector.wallet();
  return wallet.signAndSendTransaction({
    receiverId: contract,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: method,
          args,
          gas: (opts.gas ?? 30n * TGAS).toString(),
          deposit: (opts.deposit ?? 0n).toString(),
        },
      },
    ],
  });
}

/** Pulls the contract's panic message out of whatever the wallet threw. */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  const m = raw.match(/Smart contract panicked: ([^"\\}]+)/);
  if (m) return m[1];
  if (/reject|cancel|denied|closed/i.test(raw)) return "Cancelled in the wallet.";
  return raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
}
