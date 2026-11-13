import { useEffect, useState } from "react";
import { ARENA, NETWORK } from "./config";
import { connector, useAccount } from "./near";
import { short } from "./fmt";
import { MeContext, Toasts } from "./shared";
import { RiskDialog, ThemeToggle } from "./ui";
import Landing from "./Landing";
import { Wordmark } from "./Brand";
import Brackets from "./Brackets";
import Launch from "./Launch";
import TournamentPage from "./TournamentPage";
import Rules from "./Rules";

function useRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => {
      const next = window.location.hash;
      setHash(next);
      if (next !== "#faq" && next !== "#how") window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // In-page anchors on the landing page keep the landing route.
  if (hash === "#how" || hash === "#faq") return "";
  return hash.replace(/^#\/?/, "");
}

/** The connected account. Disconnecting takes a second, deliberate click. */
function Wallet({ account }: { account: string | null }) {
  const [open, setOpen] = useState(false);
  return account ? (
    <div className="moreb walletb">
      <button className="btn ghost wallet" onClick={() => setOpen((x) => !x)} aria-expanded={open} title={account}>
        <span className="role you">You</span> {short(account)}
      </button>
      {open && (
        <div className="moremenu right" onClick={() => setOpen(false)}>
          <span className="menuacct">{account}</span>
          <button onClick={() => connector.disconnect()}>Disconnect</button>
        </div>
      )}
    </div>
  ) : (
    <button className="btn" onClick={() => connector.connect().catch(() => {})}>
      Connect wallet
    </button>
  );
}

const NAV = [
  { href: "#/app", label: "Brackets", match: (r: string) => r === "app" || r.startsWith("t/") },
  { href: "#/launch", label: "Launch a coin", match: (r: string) => r.startsWith("launch") },
  { href: "#/rules", label: "Rules", match: (r: string) => r === "rules" },
];

export default function App() {
  const route = useRoute();
  const account = useAccount();
  const [moreOpen, setMoreOpen] = useState(false);
  const landing = route === "" || route === "faq";
  const tid = route.match(/^t\/(\d+)$/)?.[1];
  const launchTicker = route.match(/^launch\/([A-Za-z0-9]{2,8})$/)?.[1]?.toUpperCase() ?? "";

  if (landing) {
    return (
      <>
        <header className="top landingtop onhero">
          <Wordmark short />
          <div className="topright">
            <ThemeToggle />
            <a className="btn ghost pitchbtn" href="pitch/">
              Pitch
            </a>
            <a className="btn" href="#/app">
              Open app
            </a>
          </div>
        </header>
        <main className="lmain">
          <Landing />
        </main>
        <Toasts />
      </>
    );
  }

  return (
    <MeContext.Provider value={account}>
      <header className="top apptop">
        <Wordmark />
        <nav className="appnav" aria-label="App">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={n.match(route) ? "on" : ""}>
              {n.label}
            </a>
          ))}
          <div className="moreb">
            <button onClick={() => setMoreOpen((x) => !x)} aria-expanded={moreOpen}>
              More
            </button>
            {moreOpen && (
              <div className="moremenu" onClick={() => setMoreOpen(false)}>
                <a href="#/faq">FAQ</a>
                <a href="#/">About HITC</a>
              </div>
            )}
          </div>
        </nav>
        <div className="topright">
          <span className="envchip">
            <i /> {NETWORK === "testnet" ? "Live on NEAR testnet" : "NEAR mainnet"}
          </span>
          <ThemeToggle />
          <a className="btn ghost pitchbtn" href="pitch/">
            Pitch
          </a>
          <Wallet account={account} />
        </div>
      </header>
      <main className="appmain">
        {!ARENA ? (
          <div className="emptystate">
            <h2>No arena configured</h2>
            <p>
              Set <code>VITE_ARENA</code> in <code>web/.env</code>.
            </p>
          </div>
        ) : tid ? (
          <TournamentPage id={Number(tid)} account={account} />
        ) : route.startsWith("launch") ? (
          <Launch account={account} ticker={launchTicker} />
        ) : route === "rules" ? (
          <Rules />
        ) : (
          <Brackets account={account} />
        )}
        <footer className="foot">
          Rules live in the contracts. No owner, no admin key, no upgrade. <a href="#/rules">Read the rules</a>
        </footer>
      </main>
      <RiskDialog />
      <Toasts />
    </MeContext.Provider>
  );
}
