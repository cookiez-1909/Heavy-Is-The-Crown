import type { Config } from "./types";
import { duration, near } from "./fmt";

/** The question judges and traders ask first. Shared by the FAQ and the landing page. */
export function WhyHereAnswer({ p, r }: { p: number; r: number }) {
  return (
    <>
      It depends on who you are. <b>If you launched the original</b>, the bracket is a shield: once your coin is champion, every later copy of the ticker has to beat you first, and if it loses, its liquidity and holders move into your coin, with {r}% of what it brings paid to you as creator. Copies feed you instead of splitting your buyers. <b>If you hold a copy that loses</b>, about {100 - p}% of its liquidity comes back to you as the winner's tokens. <b>If you trade</b>, the ticker ends with one deep pool instead of a guessing game.
      <span className="fine">
        Selling right after a conversion is taxed while the post-win sell tax fades. Elsewhere a copy that loses the crowd stays a separate, thinning pool; we do not claim its holders lose everything. Only coins launched here are in a bracket.
      </span>
    </>
  );
}

export default function Faq({ config }: { config: Config | null }) {
  const p = config ? config.penalty_bps / 100 : 15;
  const r = config?.creator_reward_bps !== undefined ? config.creator_reward_bps / 100 : 1;
  const cap = config?.score_cap ? `${near(config.score_cap)} NEAR` : "a fixed amount of NEAR";
  const qa: [string, React.ReactNode, boolean?][] = [
    ["Why would anyone launch a copy here, if it can lose?", <WhyHereAnswer p={p} r={r} />, true],
    [
      "What problem does this solve?",
      <>When something goes viral it gets launched many times with the same ticker, and the copies split the same buyers. Here, copies launched with the same ticker are forced into one bracket, and the bracket merges their liquidity into a single coin.</>,
    ],
    [
      "What happens to my coin if it loses?",
      <>
        Its whole reserve moves to the winner. {p}% is the penalty: {r}% of it goes to the winning coin's creator and the rest stays in the winner's curve with no new tokens (the winners' spoils). The other {100 - p}% buys winner tokens, and you claim your share by burning your dead coin with the "Convert my bag" button. If that winner later loses too, you convert again.
      </>,
    ],
    [
      "How is the winner of a round decided?",
      <>By score: the NEAR that came into the coin's curve since the round started, multiplied by how long it stayed. Liquidity the coin already had scores nothing, a buy in the last minutes scores little, and each wallet counts for at most {cap} per round. The two token contracts compare scores themselves.</>,
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
      "Can one wallet carry a coin through a round?",
      <>Not alone: each wallet's net inflow counts for at most {cap} per round, however much it buys. Someone can split money across several wallets to get around the cap; each wallet then pays for its own token storage and fees. The cap limits a whale, it does not turn the score into one person, one vote.</>,
    ],
    [
      "Can someone stuff a bracket with empty copies?",
      <>One account can launch one coin per bracket, so stuffing takes one funded wallet per copy. Every copy also brings its seed, and when it loses, that seed flows into the coin that beat it. Stuffing a bracket mostly pays your rivals.</>,
    ],
    [
      "Could another launchpad use this?",
      <>In principle: the arena is just a contract, so a launchpad such as meme.cooking could route same-ticker launches into a bracket. That is an idea, not an agreement. Nobody has agreed to it.</>,
    ],
    [
      "What can still go wrong?",
      <>A group of wallets can still pool money to carry a coin. A bracket's slots can be filled by copies from different wallets. The sell tax discourages running but cannot stop it. The contracts are hackathon code and have not been audited. The Rules page lists every known limit.</>,
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
