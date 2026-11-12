export const NETWORK = (import.meta.env.VITE_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const ARENA: string = import.meta.env.VITE_ARENA ?? "";
export const RPC: string =
  import.meta.env.VITE_RPC ?? (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
/** Primary endpoint first, then a fallback for when it throttles. A custom VITE_RPC is used alone. */
export const RPCS: string[] = import.meta.env.VITE_RPC ? [RPC] : [RPC, NETWORK === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org"];
export const EXPLORER = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
