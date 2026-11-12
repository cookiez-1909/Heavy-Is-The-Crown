// Shared by the browser (live data) and scripts/radar.mjs (snapshot).
//
// The numbers are meant to be checked by hand on meme.cooking, so this counts
// exactly what that site displays: listings that hold a deposit. A ticker is
// "contested" when at least two different accounts have such a listing.

export interface Listing {
  id: number;
  name: string;
  owner: string;
  /** reached its soft cap and became a token */
  launched: boolean;
}

export interface Dup {
  ticker: string;
  creators: number;
  listings: Listing[];
}

export interface RadarData {
  fetchedAt: string;
  /** listings meme.cooking displays */
  visible: number;
  /** everything its API returns, including empty listings the site hides */
  total: number;
  /** displayed listings that are on a contested ticker */
  sharing: number;
  tickers: number;
  top: Dup[];
  live?: boolean;
}

export interface ApiMeme {
  meme_id: number;
  symbol?: string | null;
  name?: string | null;
  owner?: string | null;
  total_deposit?: string | null;
  token_id?: string | null;
}

export function computeRadar(memes: ApiMeme[], fetchedAt: string, keep = 12): RadarData {
  const shown = memes.filter((m) => {
    try {
      return BigInt(m.total_deposit ?? "0") > 0n;
    } catch {
      return false;
    }
  });
  const by = new Map<string, Listing[]>();
  for (const m of shown) {
    const t = (m.symbol ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(t)) continue;
    const list = by.get(t) ?? [];
    list.push({ id: m.meme_id, name: (m.name ?? "").slice(0, 40), owner: m.owner ?? "", launched: !!m.token_id });
    by.set(t, list);
  }
  const dups: Dup[] = [];
  for (const [ticker, listings] of by) {
    const creators = new Set(listings.map((l) => l.owner)).size;
    if (creators > 1) dups.push({ ticker, creators, listings: listings.sort((a, b) => Number(b.launched) - Number(a.launched) || a.id - b.id) });
  }
  dups.sort((x, y) => y.creators - x.creators || y.listings.length - x.listings.length || x.ticker.localeCompare(y.ticker));
  return {
    fetchedAt,
    visible: shown.length,
    total: memes.length,
    sharing: dups.reduce((n, d) => n + d.listings.length, 0),
    tickers: dups.length,
    top: dups.slice(0, keep),
  };
}
