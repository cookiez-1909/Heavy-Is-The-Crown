import { useEffect } from "react";
import { ARENA } from "./config";
import { view } from "./near";
import { usePoll, Reveal } from "./shared";
import { HeroBracket } from "./HeroBracket";
import DexSection, { LiquiditySplit } from "./Dex";
import Radar from "./Radar";
import Faq, { WhyHereAnswer } from "./Faq";
import type { Config } from "./types";

export default function Landing() {
  const { data: config } = usePoll(() => view<Config>(ARENA, "get_config"), [], 60_000);
  const p = config ? config.penalty_bps / 100 : 15;
  const pick = (ticker: string) => (window.location.hash = `#/launch/${ticker}`);
  useEffect(() => {
    if (window.location.hash === "#/faq") setTimeout(() => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" }), 300);
  }, []);

  return (
    <div className="landing">
      <section className="hero2">
        <div>
          <p className="envchip">
            <i /> Live on NEAR testnet
          </p>
          <h1>
            <span className="rise">One ticker.</span>
            <br />
            <span className="rise d1">One</span> <em className="rise d2">survivor.</em>
          </h1>
          <p className="lede">Every copy of a memecoin lands in the same bracket. Round by round, the weaker copy's liquidity moves into the stronger one.</p>
          <div className="ctas">
            <a className="btn big" href="#/app">
              Open app
            </a>
            <a className="btn ghost big" href="#how">
              How it works
            </a>
          </div>
        </div>
        <HeroBracket />
      </section>

      <Reveal>
        <LiquiditySplit />
      </Reveal>

      <Reveal>
        <section className="how" id="how">
          <h2>How it works</h2>
          <ol>
            <li>
              <i className="stepn">1</i>
              <b>Register</b>
              <span>The first coin of a ticker opens its bracket. Every copy launched during registration joins it.</span>
            </li>
            <li>
              <i className="stepn">2</i>
              <b>Fight</b>
              <span>Copies are paired. The one that pulls in more new money, and keeps it longer, wins the round.</span>
            </li>
            <li>
              <i className="stepn">3</i>
              <b>Merge</b>
              <span>The loser's liquidity and holders move into the winner. The last coin standing holds all of it.</span>
            </li>
          </ol>
        </section>
      </Reveal>

      <Reveal>
        <section className="whyhere">
          <div className="whyhead">
            <div>
              <p className="eyebrow accent">The question everyone asks</p>
              <h2>Why launch a copy here, if it can lose?</h2>
            </div>
          </div>
          <div className="whystats">
            <div>
              <strong>≈{100 - p}%</strong>
              <span>of a losing copy's liquidity comes back to its holders, as winner tokens</span>
            </div>
            <div>
              <strong>1 pool</strong>
              <span>at the end: buyers stop guessing which copy is "the" coin</span>
            </div>
            <div>
              <strong>All of it</strong>
              <span>every copy's liquidity ends up in the coin people actually backed</span>
            </div>
          </div>
          <p className="whytext">
            <WhyHereAnswer p={p} />
          </p>
        </section>
      </Reveal>

      <Reveal>
        <h2>How common it is</h2>
        <DexSection pick={pick} />
      </Reveal>
      <Reveal>
        <h2>And on NEAR</h2>
        <Radar pick={pick} />
      </Reveal>

      <Reveal>
        <Faq config={config ?? null} />
      </Reveal>

      <section className="endcta">
        <h2>Launch a copy. Then beat it.</h2>
        <a className="btn big" href="#/app">
          Open app
        </a>
        <p className="fine">NEAR testnet prototype · Contracts not audited · Only coins launched here are merged</p>
      </section>
    </div>
  );
}
