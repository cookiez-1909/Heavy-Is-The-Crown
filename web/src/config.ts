export const NETWORK = (import.meta.env.VITE_NETWORK ?? "testnet") as "testnet" | "mainnet";
/** The public testnet arena unless web/.env says otherwise, so a fresh clone works without setup. */
export const ARENA: string = import.meta.env.VITE_ARENA || (NETWORK === "testnet" ? "arena-33881.memeduel-4a2d2e.testnet" : "");
export const RPC: string =
  import.meta.env.VITE_RPC ?? (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
/** Primary endpoint first, then a fallback for when it throttles. A custom VITE_RPC is used alone. */
export const RPCS: string[] = import.meta.env.VITE_RPC
  ? [RPC]
  : NETWORK === "mainnet"
    ? [RPC, "https://near.drpc.org", "https://rpc.mainnet.near.org"]
    : [RPC, "https://near-testnet.drpc.org", "https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"];
export const EXPLORER = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
