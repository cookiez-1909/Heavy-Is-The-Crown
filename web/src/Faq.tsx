import type { Config } from "./types";
import { duration, near } from "./fmt";

/** The question judges and traders ask first. Shared by the FAQ and the landing page. */
export function WhyHereAnswer({ p }: { p: number }) {
  return (
    <>
      Because holders choose where to buy, and here a lost round is not the end of their money. When a copy loses, its liquidity is not stranded: <b>about {100 - p}% of it comes back to its holders as tokens of the winner</b>. The other {p}% stays in the winner's curve, and whoever settles the match is paid at most 0.05 NEAR. The coin that wins ends up holding the liquidity of every copy, so the launcher whose copy people actually want gets all of it.
      <span className="fine">
        Selling right after a conversion is taxed while the post-win sell tax fades. Elsewhere a copy that loses the crowd just stays a separate, thinning pool; we do not claim its holders lose everything.
      </span>
    </>
  );
}

export default function Faq({ config }: { config: Config | null }) {
  const p = config ? config.penalty_bps / 100 : 15;
  const qa: [string, React.ReactNode, boolean?][] = [
    ["Why would anyone launch a copy here, if it can lose?", <WhyHereAnswer p={p} />, true],
    [
      "What problem does this solve?",
      <>When something goes viral it gets launched many times with the same ticker, and the copies split the same buyers. Here, copies launched with the same ticker are forced into one bracket, and the bracket merges their liquidity into a single coin.</>,
    ],
    [
      "What happens to my coin if it loses?",
      <>
        Its whole reserve moves to the winner. {p}% is added to the winner's curve with no new tokens (the winners' spoils). The other {100 - p}% buys winner tokens, and you claim your share by burning your dead coin with the "Convert my bag" button. If that winner later loses too, you convert again.
      </>,
    ],
    [
      "How is the winner of a round decided?",
      <>By score: the NEAR that came into the coin's curve since the round started, multiplied by how long it stayed. Liquidity the coin already had scores nothing, and a buy in the last minutes scores almost nothing. The two token contracts compare scores themselves.</>,
    ],
    [
      "Why is there a sell tax?",
      <>
        Without it, holders of the coin that is about to lose would sell just before the bell and skip the penalty. The tax ramps from 0% to {p}% over the round, so leaving at the bell costs the same as losing. After a win it restarts at {p}% and fades{config ? ` over ${duration(config.cooldown_ns)}` : ""}, so winners cannot dump on the holders who were just converted in. The tax never leaves the coin's curve.
      </>,
    ],
    [
      "Can the team change the rules or take the money?",
      <>No. Neither contract has an owner or an admin method. The arena account has no access keys, so its code cannot be replaced, and every coin runs the same token code pinned by hash. The numbers on the Rules page are read from the contract.</>,
    ],
    [
      "What does it cost to launch?",
      <>
        {config ? `${near(config.launch_fee)} NEAR` : "A small"} fee for the coin's account, plus a seed of at least {config ? `${near(config.min_seed, 3)} NEAR` : "the minimum"}. The seed is not a fee: it buys your first tokens from your own coin's curve.
      </>,
    ],
    [
      "I launched late and the ticker is locked. Now what?",
      <>Wait for the bracket to finish. Launching the ticker after that opens a new season, and the reigning champion is automatically entered in it, so you face it directly.</>,
    ],
    [
      "Does it cover copies launched on other launchpads?",
      <>No. A contract can only move liquidity it holds, so only coins launched here are in the bracket. The DexScreener and meme.cooking numbers on this page show how common the problem is; they are not coins we can merge.</>,
    ],
    [
      "What can still go wrong?",
      <>A wallet with enough NEAR can carry a coin through a round on its own. Someone can pay to fill a bracket's remaining slots with seeded copies. The sell tax discourages running but cannot stop it. The contracts are hackathon code and have not been audited. The Rules page lists every known limit.</>,
    ],
  ];
  return (
    <section className="faq" id="faq">
      <h2>FAQ</h2>
      {qa.map(([q, a, hl]) => (
        <details key={q} className={hl ? "hl" : ""} open={hl}>
          <summary>
            {hl && <span className="faqtag">Asked most</span>}
            {q}
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </section>
  );
}
