import { useEffect, useState } from "react";
import snapshot from "./radar.json";
import { computeRadar, type ApiMeme, type RadarData } from "./radarCompute";

export const radarSnapshot: RadarData = snapshot;
export const listingUrl = (id: number) => `https://meme.cooking/meme/${id}`;

/** Ships with a snapshot (scripts/radar.mjs); replaced by live data when the API lets this origin call it. */
export function useRadar(): RadarData {
  const [data, setData] = useState<RadarData>(snapshot);
  useEffect(() => {
    fetch("https://api.meme.cooking/meme")
      .then((r) => r.json())
      .then((memes: ApiMeme[]) => setData({ ...computeRadar(memes, ""), live: true }))
      .catch(() => {});
  }, []);
  return data;
}

/** One row per ticker. Every dot is one listing and links to its page on meme.cooking. */
export function DupRows({ data, rows = 8, pick }: { data: RadarData; rows?: number; pick?: (ticker: string) => void }) {
  return (
    <div className="duprows">
      {data.top.slice(0, rows).map((d, r) => (
        <div key={d.ticker} className="duprow">
          {pick ? (
            <button className="tk" onClick={() => pick(d.ticker)} title={`Open the $${d.ticker} bracket here`}>
              ${d.ticker}
            </button>
          ) : (
            <span className="tk">${d.ticker}</span>
          )}
          <span className="dots">
            {d.listings.map((l, i) => (
              <a
                key={l.id}
                href={listingUrl(l.id)}
                target="_blank"
                rel="noreferrer"
                className={l.launched ? "one" : ""}
                style={{ animationDelay: `${r * 70 + i * 40}ms` }}
                title={`${l.name} · by ${l.owner} · ${l.launched ? "launched" : "did not reach its soft cap"} · meme.cooking/meme/${l.id}`}
                aria-label={`${l.name} by ${l.owner}, listing ${l.id} on meme.cooking`}
              />
            ))}
          </span>
          <span className="ct">
            <b>{d.listings.length}</b> listings · <b>{d.creators}</b> accounts
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Radar({ pick }: { pick: (ticker: string) => void }) {
  const data = useRadar();
  const pct = Math.round((data.sharing / data.visible) * 100);
  return (
    <section className="radar">
      <div className="radarhead">
        <div className="bigstat">
          <strong>{data.tickers}</strong>
          <span>tickers on meme.cooking have been listed by two or more different accounts</span>
        </div>
        <div className="split">
          <div className="splitbar" role="img" aria-label={`${data.sharing} of ${data.visible} listings are on a contested ticker`}>
            <div className="dup" style={{ width: `${pct}%` }} />
            <div className="uniq" />
          </div>
          <div className="splitkey">
            <span>
              <b>{data.sharing}</b> of the <b>{data.visible}</b> listings meme.cooking displays ({pct}%)
            </span>
            <span>{data.visible - data.sharing} on a ticker only one account used</span>
          </div>
        </div>
      </div>
      <p className="radarlead">
        Same ticker, different deployers, split buyers. Each dot is one listing: <i className="k one" /> launched, <i className="k" /> never reached its soft cap. <b>Click any dot to open that listing on meme.cooking</b>, or search the ticker there and count the cards. Click a ticker to open its bracket here.
      </p>
      <DupRows data={data} pick={pick} />
      <p className="asof">
        Source: {data.live ? "live from api.meme.cooking" : `api.meme.cooking, snapshot of ${data.fetchedAt}`}. Counted the way meme.cooking displays it: only listings that hold a deposit ({data.visible} of the {data.total.toLocaleString("en-US")} the API returns). Reproduce with <code>node scripts/radar.mjs</code>.
      </p>
    </section>
  );
}
