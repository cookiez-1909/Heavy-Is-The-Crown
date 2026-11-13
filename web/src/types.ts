export type Status = "Live" | "Advanced" | "Lost";
export type Phase = "Registration" | "Playing" | "Finished";

export interface Info {
  name: string;
  symbol: string;
  creator: string;
  status: Status;
  rival: string | null;
  arena: string;
  round_start_ns: string;
  round_end_ns: string;
  now_ns: string;
  penalty_bps: number;
  cooldown_ns: string;
  sell_tax_bps: number;
  virtual_near: string;
  reserve: string;
  round_base: string;
  /** Older token code has no score cap and does not report these. */
  scored_inflow?: string;
  score_cap?: string;
  creator_reward_bps?: number;
  creator_rewards?: string;
  pool_tokens: string;
  total_supply: string;
  price: string;
  score: string;
  trades: number;
  spoils: string;
  wins: number;
  absorbed_by: string | null;
  pool_remaining: string;
  supply_remaining: string;
  pool_ready: boolean;
}

export interface Trade {
  account: string;
  kind: "buy" | "sell" | "spoils" | "convert" | "claim" | "reward";
  near: string;
  tokens: string;
  ts: string;
}

export interface Entrant {
  token: string;
  name: string;
  creator: string;
  eliminated_in: number | null;
  last_score: string;
}

export interface Match {
  a: number;
  b: number | null;
  winner: number | null;
  score_a: string | null;
  score_b: string | null;
}

export interface Tournament {
  id: number;
  ticker: string;
  season: number;
  phase: Phase;
  round: number;
  round_end_ns: string;
  entrants: Entrant[];
  rounds: Match[][];
  champion: number | null;
  bounty_pool: string;
  pending_launches: number;
  advancing: boolean;
}

export interface Meme {
  name: string;
  symbol: string;
  icon: string | null;
}

export interface Config {
  registration_ns: string;
  round_ns: string;
  cooldown_ns: string;
  penalty_bps: number;
  virtual_near: string;
  min_seed: string;
  max_entrants: number;
  creator_reward_bps?: number;
  score_cap?: string;
  token_code_hash: string;
  launch_fee: string;
}
