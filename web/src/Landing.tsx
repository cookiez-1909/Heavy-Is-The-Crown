import { useEffect } from "react";
import { ARENA, NETWORK } from "./config";
import { view } from "./near";
import { usePoll, Reveal } from "./shared";
import { HeroBracket } from "./HeroBracket";
import DexSection, { dex, LiquiditySplit } from "./Dex";
import Radar, { radarSnapshot } from "./Radar";
import Faq, { WhyHereAnswer } from "./Faq";
import { CrownArt, SectionHead } from "./Brand";
import type { Config } from "./types";

export default function Landing() {
  const { data: config } = usePoll(() => view<Config>(ARENA, "get_config"), [], 60_000);
  const p = config ? config.penalty_bps / 100 : 15;
  const r = config?.creator_reward_bps !== undefined ? config.creator_reward_bps / 100 : 1;
  const pick = (ticker: string) => (window.location.hash = `#/launch/${ticker}`);
  useEffect(() => {
    if (window.location.hash === "#/faq") setTimeout(() => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" }), 300);
  }, []);

  return (
    <div className="landing">
      <section className="hero3">
        <div className="herolabels">
          <span>(Memecoin launchpad)</span>
          <span>One ticker. One survivor.</span>
          <span className="livelabel">
            <i /> Live on NEAR {NETWORK}
          </span>
        </div>
        <div className="herocrown">
          <CrownArt draw title="A crown, drawn line by line" />
        </div>
        <div className="herobottom">
          <h1 className="heroname" aria-label="Heavy Is The Crown">
            <span className="rise">Heavy Is</span>
            <span className="rise d1">The Crown</span>
          </h1>
          <div className="heroside">
            <p>Every copy of a memecoin lands in the same bracket. Round by round, the weaker copy's liquidity moves into the stronger one. The last coin wears the crown, and has to defend it.</p>
            <div className="ctas">
              <a className="cbtn solid" href="#/app">
                Open app
              </a>
              <a className="cbtn" href="#how">
                How it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="sec" data-side="/the problem">
          <SectionHead n="01" label="THE PROBLEM" />
          <p className="statement">
            When a meme goes viral, it gets launched again and again under the same ticker. <span>The copies split the same buyers, and every pool ends up thin.</span>
          </p>
          <dl className="bignums">
            <div>
              <dt>
                {dex.shared}
                <small>/{dex.promoted}</small>
              </dt>
              <dd>of the tokens promoted most on DexScreener share their ticker with another token</dd>
            </div>
            <div>
              <dt>
                {dex.totalTokens}
                <small>+</small>
              </dt>
              <dd>token contracts found on those {dex.promoted} tickers (a lower bound)</dd>
            </div>
            <div>
              <dt>{radarSnapshot.tickers}</dt>
              <dd>tickers on meme.cooking, on NEAR, listed by two or more different accounts</dd>
            </div>
          </dl>
          <Reveal>
            <LiquiditySplit />
          </Reveal>
        </section>

        <section className="sec" id="how" data-side="/the mechanic">
          <SectionHead n="02" label="HOW IT WORKS" title="how it works" />
          <div className="howgrid">
            <div className="howart darkzone">
              <span className="tinylabel">(One bracket per ticker)</span>
              <HeroBracket />
              <span className="tinylabel">Liquidity flows from each loser into its winner</span>
            </div>
            <ol className="howlist">
              <li>
                <i>01</i>
                <div>
                  <b>Register</b>
                  <span>The first coin of a ticker opens its bracket. Every copy launched during registration joins it.</span>
                </div>
              </li>
              <li>
                <i>02</i>
                <div>
                  <b>Fight</b>
                  <span>Copies are paired. The one that pulls in more new money, and keeps it longer, wins the round.</span>
                </div>
              </li>
              <li>
                <i>03</i>
                <div>
                  <b>Merge</b>
                  <span>The loser's liquidity and holders move into the winner. The last coin standing holds all of it.</span>
                </div>
              </li>
              <li>
                <i>04</i>
                <div>
                  <b>Defend</b>
                  <span>Launch the ticker again and a new season opens with the champion already entered. The crown has to be kept.</span>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="sec" data-side="/why here">
          <SectionHead n="03" label="WHY HERE" title="why launch a copy here, if it can lose?" />
          <div className="bento">
            <div className="bcard darkzone">
              <span className="tinylabel">(If you launched the original)</span>
              <strong>A shield</strong>
              <p>Later copies must beat you first, and feed your coin when they lose.</p>
            </div>
            <div className="bcard">
              <span className="tinylabel">(If your copy loses)</span>
              <strong>≈{100 - p}% back</strong>
              <p>of a losing copy's liquidity goes to its holders, as the winner's tokens.</p>
            </div>
            <div className="bcard gold">
              <span className="tinylabel">(If your coin wins)</span>
              <strong>{r}% reward</strong>
              <p>to the creator of the winning coin, from every coin it absorbs.</p>
            </div>
          </div>
          <p className="whytext">
            <WhyHereAnswer p={p} r={r} />
          </p>
        </section>

        <section className="sec" data-side="/the numbers">
          <SectionHead n="04" label="THE NUMBERS" title="how common it is">
            <p className="secsub">Every figure links to its source. Click a dot to open that token, or the count to open the search that returned it.</p>
          </SectionHead>
          <Reveal>
            <h3 className="subhead">Across chains, on DexScreener</h3>
            <DexSection pick={pick} />
          </Reveal>
          <Reveal>
            <h3 className="subhead">On NEAR, on meme.cooking</h3>
            <Radar pick={pick} />
          </Reveal>
        </section>

        <section className="sec" data-side="/questions">
          <SectionHead n="05" label="FAQ" title="questions" />
          <Faq config={config ?? null} />
        </section>
      </div>

      <footer className="endzone darkzone">
        <div className="secrule">
          <span>06</span>
          <i />
          <span>/YOUR MOVE</span>
        </div>
        <h2 className="endname">
          Launch a copy.
          <br />
          Then beat it.
        </h2>
        <div className="endrow">
          <div className="ctas">
            <a className="cbtn solid" href="#/app">
              Open app
            </a>
            <a className="cbtn" href="pitch/">
              Watch the pitch
            </a>
          </div>
          <p className="fine">NEAR testnet prototype · Contracts not audited · Only coins launched here are merged</p>
        </div>
        <div className="endmark">
          <CrownArt />
          <span>HITC</span>
          <small>Heavy Is The Crown · ©2026</small>
        </div>
      </footer>
    </div>
  );
}
