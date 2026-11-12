import snapshot from "./dex.json";

export interface DexToken {
  chain: string;
  address: string;
  name: string;
  liquidity: number;
  url: string;
}

export interface DexRow {
  symbol: string;
  chain: string;
  address: string;
  url: string;
  /** the API call that reproduces this row */
  search: string;
  pairsReturned: number;
  tokens: DexToken[];
}

export interface DexData {
  fetchedAt: string;
  source: string;
  /** tokens on DexScreener's top-boosts list that have a ticker */
  promoted: number;
  /** of those, how many share their ticker with at least one other token */
  shared: number;
  five: number;
  ten: number;
  totalTokens: number;
  capped: number;
  chains: Record<string, number>;
  rows: DexRow[];
}

export const dex: DexData = snapshot;
export const when = (d: DexData) => d.fetchedAt.replace("T", " ").replace("Z", " UTC");
export const isSelf = (r: DexRow, t: DexToken) => t.chain === r.chain && t.address.toLowerCase() === r.address.toLowerCase();

/** One row per promoted ticker. Every dot is a distinct token contract and links to it on DexScreener. */
export function DexRows({ data = dex, rows = 10, pick }: { data?: DexData; rows?: number; pick?: (ticker: string) => void }) {
  return (
    <div className="duprows dexrows">
      {data.rows.slice(0, rows).map((r, k) => {
        const ticker = r.symbol.toUpperCase();
        const usable = /^[A-Z0-9]{2,8}$/.test(ticker);
        return (
          <div key={r.chain + r.address} className="duprow">
            {pick && usable ? (
              <button className="tk" onClick={() => pick(ticker)} title={`Open the $${ticker} bracket here`}>
                ${ticker}
              </button>
            ) : (
              <span className="tk">${ticker}</span>
            )}
            <span className="dots">
              {r.tokens.map((t, i) => (
                <a
                  key={t.chain + t.address}
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                  className={isSelf(r, t) ? "one" : ""}
                  style={{ animationDelay: `${k * 60 + i * 18}ms` }}
                  title={`${t.name} · ${t.chain} · $${t.liquidity.toLocaleString("en-US")} liquidity${isSelf(r, t) ? " · the promoted one" : ""}`}
                  aria-label={`${t.name} on ${t.chain}, open on DexScreener`}
                />
              ))}
            </span>
            <a className="ct" href={r.search} target="_blank" rel="noreferrer" title="Open the DexScreener API call that returns these tokens">
              <b>
                {r.tokens.length}
                {r.pairsReturned >= 30 ? "+" : ""}
              </b>{" "}
              tokens ↗
            </a>
          </div>
        );
      })}
    </div>
  );
}

const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);

/**
 * Problem and solution side by side, on a real ticker: the liquidity of the
 * same-ticker tokens as separate pools, then as the one pool a bracket ends with.
 */
export function LiquiditySplit({ row = dex.rows[0] }: { row?: DexRow }) {
  const ticker = row.symbol.toUpperCase();
  const pools = row.tokens.filter((t) => t.liquidity > 0);
  const total = pools.reduce((n, t) => n + t.liquidity, 0);
  const top = pools[0];
  const empty = row.tokens.length - pools.length;
  const topPct = Math.round((top.liquidity / total) * 100);
  return (
    <section className="liq">
      <div className="liqside problem">
        <p className="eyebrow">The problem</p>
        <h2>
          {usd(total)} of liquidity, in <em>{pools.length} separate pools.</em>
        </h2>
        <div className="liqbar" role="img" aria-label={`${pools.length} pools holding ${usd(total)} between them`}>
          {pools.map((t, i) => (
            <a
              key={t.chain + t.address}
              href={t.url}
              target="_blank"
              rel="noreferrer"
              style={{ flexGrow: t.liquidity, animationDelay: `${i * 35}ms` }}
              title={`${t.name} · ${t.chain} · ${usd(t.liquidity)}`}
              aria-label={`${t.name} on ${t.chain}: ${usd(t.liquidity)}`}
            />
          ))}
        </div>
        <p>
          That is ${ticker} on DexScreener: {row.tokens.length} tokens with the same ticker. The deepest pool holds <b>{topPct}%</b> of the money ({usd(top.liquidity)}), so every buyer trades against a fraction of the depth that exists
          {empty > 0 ? `, and ${empty} of the tokens have no liquidity left at all` : ""}. Each block is one token: click to open it.
        </p>
      </div>
      <div className="liqside solution">
        <p className="eyebrow">What a bracket does</p>
        <h2>
          Same money, <em>one pool.</em>
        </h2>
        <div className="liqbar merged" aria-hidden>
          {pools.map((t) => (
            <i key={t.chain + t.address} style={{ flexGrow: t.liquidity }} />
          ))}
        </div>
        <p>
          Copies launched here with the same ticker are paired off round by round. Each round the loser's whole reserve moves into the winner's curve and its holders are converted, so the bracket ends with <b>one coin holding the liquidity of all of them</b>.
        </p>
      </div>
      <p className="asof">
        ${ticker} figures: liquidity of the pairs DexScreener returned on {when(dex)} (at most 30, so a lower bound). Those tokens live on other chains and are shown to size the problem; a bracket only merges coins launched on this launchpad.
      </p>
    </section>
  );
}

export default function DexSection({ pick }: { pick: (ticker: string) => void }) {
  const pct = Math.round((dex.shared / dex.promoted) * 100);
  return (
    <section className="radar">
      <div className="radarhead">
        <div className="bigstat">
          <strong>
            {dex.shared}
            <small>/{dex.promoted}</small>
          </strong>
          <span>of the tokens promoted most on DexScreener share their ticker with another token</span>
        </div>
        <div className="split">
          <div className="splitbar" role="img" aria-label={`${dex.shared} of ${dex.promoted} promoted tokens share their ticker`}>
            <div className="dup" style={{ width: `${pct}%` }} />
            <div className="uniq" />
          </div>
          <div className="splitkey">
            <span>
              <b>{dex.ten}</b> of them with 9 or more others · at least <b>{dex.totalTokens}</b> tokens on {dex.promoted} tickers
            </span>
            <span>{dex.promoted - dex.shared} with a ticker to themselves</span>
          </div>
        </div>
      </div>
      <p className="radarlead">
        Take the tokens being promoted the most on DexScreener and search each ticker. Each dot is a different token contract with that ticker: <i className="k one" /> the promoted one, <i className="k" /> the others. <b>Click any dot to open that token on DexScreener</b>, or the count to open the search that returned them.
      </p>
      <DexRows rows={8} pick={pick} />
      <p className="asof">
        Source: api.dexscreener.com, snapshot of {when(dex)}. The list is DexScreener's top boosts, not hand-picked. A search returns at most 30 pairs, so counts marked + are lower bounds. Sharing a ticker does not prove a token is a copy: short generic tickers (MAX, ZEN) include unrelated projects. Reproduce with <code>node scripts/dexscreener.mjs</code>.
      </p>
    </section>
  );
}
