// Off-chain model of one bracket match, using the same formulas as contracts/token.
// Used to pick parameters before launch and to draw the chart on the Rules page.

export interface Params {
  hours: number; // round length
  virtualNear: number; // curve depth
  penaltyBps: number; // share of the loser's reserve given to the winner's curve; also the top sell tax
  stepMin: number;
  /** false = model the old rule (no sell tax) for comparison */
  sellTax: boolean;
}

export const DEFAULTS: Params = { hours: 4, virtualNear: 50, penaltyBps: 1500, stepMin: 5, sellTax: true };
const CURVE_SUPPLY = 1e9;

export interface SideState {
  reserve: number;
  base: number; // reserve at the start of the round
  pool: number; // tokens left in the curve
  score: number; // net inflow x hours
  taxed: number; // sell tax kept in the curve
}

export interface Point {
  t: number;
  reserve: [number, number];
  inflow: [number, number];
  supply: [number, number];
  score: [number, number];
}

export interface Result {
  name: string;
  story: string;
  points: Point[];
  winner: 0 | 1;
  /** Who would have won if total reserve at the bell decided. */
  naiveWinner: 0 | 1;
  loserReserve: number;
  spoils: number;
  /** Sell tax collected on the losing side during the round (it is part of loserReserve). */
  loserTax: number;
  winnerPriceBump: number;
  supplyAtBell: [number, number];
  supplyAfter: [number, number];
}

/** Net NEAR that holders want to move into each side during one step. Negative = they want that much out. */
export type Flow = (tHours: number, rand: () => number) => [number, number];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function apply(s: SideState, near: number, v: number, taxRate: number) {
  if (near >= 0) {
    const n = v + s.reserve;
    s.pool -= (s.pool * near) / (n + near);
    s.reserve += near;
  } else {
    // Holders pull `gross` out of the curve; the tax share never leaves it.
    const gross = Math.min(-near, s.reserve - s.taxed);
    const n = v + s.reserve;
    s.pool = (n * s.pool) / (n - gross);
    const tax = gross * taxRate;
    s.reserve -= gross - tax;
    s.taxed += tax;
  }
}

const price = (s: SideState, v: number) => (v + s.reserve) / s.pool;
const supply = (s: SideState) => CURVE_SUPPLY - s.pool;

/** `dumped`: NEAR sold out of each side in the break before the round (the round base ignores it). */
export function simulate(name: string, story: string, start: [number, number], flow: Flow, p: Params = DEFAULTS, dumped: [number, number] = [0, 0], seed = 7): Result {
  const rand = rng(seed);
  const mk = (r: number, d: number): SideState => {
    const s = { reserve: 0, base: 0, pool: CURVE_SUPPLY, score: 0, taxed: 0 };
    apply(s, r, p.virtualNear, 0);
    s.base = r;
    if (d > 0) apply(s, -d, p.virtualNear, 0);
    return s;
  };
  const sides: [SideState, SideState] = [mk(start[0], dumped[0]), mk(start[1], dumped[1])];
  const dt = p.stepMin / 60;
  const points: Point[] = [];
  const snap = (t: number) =>
    points.push({
      t,
      reserve: [sides[0].reserve, sides[1].reserve],
      inflow: [sides[0].reserve - sides[0].base, sides[1].reserve - sides[1].base],
      supply: [supply(sides[0]), supply(sides[1])],
      score: [sides[0].score, sides[1].score],
    });
  snap(0);
  for (let t = 0; t < p.hours - 1e-9; t += dt) {
    const f = flow(t, rand);
    const tax = p.sellTax ? (p.penaltyBps / 10_000) * (t / p.hours) : 0;
    for (const i of [0, 1] as const) {
      apply(sides[i], f[i], p.virtualNear, tax);
      sides[i].score += (sides[i].reserve - sides[i].base) * dt;
    }
    snap(t + dt);
  }

  const winner: 0 | 1 = sides[0].score >= sides[1].score ? 0 : 1;
  const naiveWinner: 0 | 1 = sides[0].reserve >= sides[1].reserve ? 0 : 1;
  const w = sides[winner];
  const l = sides[1 - winner];
  const supplyAtBell: [number, number] = [supply(sides[0]), supply(sides[1])];
  const loserReserve = l.reserve;
  const spoils = (loserReserve * p.penaltyBps) / 10_000;
  const before = price(w, p.virtualNear);
  w.reserve += spoils;
  const bumped = price(w, p.virtualNear);
  apply(w, loserReserve - spoils, p.virtualNear, 0);
  const supplyAfter: [number, number] = winner === 0 ? [supply(w), 0] : [0, supply(w)];

  return {
    name,
    story,
    points,
    winner,
    naiveWinner,
    loserReserve,
    spoils,
    loserTax: l.taxed,
    winnerPriceBump: (bumped / before - 1) * 100,
    supplyAtBell,
    supplyAfter,
  };
}

const noise = (r: () => number, mean: number) => (r() < 0.35 ? mean * (0.2 + 2.6 * r()) : 0) - (r() < 0.08 ? mean * r() : 0);

export function scenarios(p: Params = DEFAULTS): Result[] {
  const h = p.hours;
  return [
    simulate("Even match", "Two copies with similar crowds buy at a similar pace all round.", [5, 5], (_t, r) => [noise(r, 0.5), noise(r, 0.47)], p),
    simulate(
      "Rich incumbent, live newcomer",
      "A enters the round with 150 NEAR absorbed from earlier opponents but nobody is buying it any more. B starts with 5 NEAR and keeps attracting buyers.",
      [150, 5],
      (_t, r) => [noise(r, 0.05), noise(r, 0.5)],
      p,
    ),
    simulate(
      "Last-minute whale",
      "A builds steadily. Ten minutes before the bell a whale drops 20 NEAR on B, three times what A collected all round.",
      [5, 5],
      (t, r) => [noise(r, 0.5), noise(r, 0.12) + (t >= h - 1 / 6 && t < h - 1 / 6 + p.stepMin / 60 ? 20 : 0)],
      p,
    ),
    simulate(
      "Run for the exit",
      "B is clearly losing two thirds of the way in, so its holders try to pull everything out before the bell.",
      [20, 20],
      (t, r) => [noise(r, 0.6), t < (h * 2) / 3 ? noise(r, 0.1) : -2.5],
      p,
    ),
    simulate(
      "Sell in the break, buy back",
      "A's holders sold 20 NEAR in the break and buy it back in the first 20 minutes to fake inflow. The round starts from the reserve at the previous bell, so the buy-back only brings A back to zero.",
      [25, 5],
      (t, r) => [t < 1 / 3 ? 20 / 4 : noise(r, 0.05), noise(r, 0.3)],
      p,
      [20, 0],
    ),
  ];
}

/** Share of a holder's stake that survives losing `rounds` rounds in a row (the holder follows the liquidity each time). */
export const survives = (penaltyBps: number, rounds: number) => Math.pow(1 - penaltyBps / 10_000, rounds) * 100;
