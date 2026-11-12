import { useEffect, useState } from "react";
import { ARENA, NETWORK } from "./config";
import { connector, useAccount } from "./near";
import { short } from "./fmt";
import { Toasts } from "./shared";
import Home from "./Home";
import TournamentPage from "./TournamentPage";
import Rules from "./Rules";

function useRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.replace(/^#\/?/, "");
}

export default function App() {
  const route = useRoute();
  const account = useAccount();
  const tid = route.match(/^t\/(\d+)$/)?.[1];

  return (
    <>
      <header className="top">
        <a className="brand" href="#/">
          TICKER<span>BRACKET</span>
        </a>
        <nav>
          <a href="#/" className={route === "" ? "on" : ""}>
            Brackets
          </a>
          <a href="#/rules" className={route === "rules" ? "on" : ""}>
            Rules
          </a>
        </nav>
        <span className="net">{NETWORK}</span>
        {account ? (
          <button className="btn ghost" onClick={() => connector.disconnect()} title="Disconnect">
            {short(account)}
          </button>
        ) : (
          <button className="btn" onClick={() => connector.connect().catch(() => {})}>
            Connect wallet
          </button>
        )}
      </header>
      <main>
        {!ARENA ? (
          <div className="empty">
            <h2>No arena configured</h2>
            <p>
              Set <code>VITE_ARENA</code> in <code>web/.env</code> to the arena contract account, then restart the dev server.
            </p>
          </div>
        ) : tid ? (
          <TournamentPage id={Number(tid)} account={account} />
        ) : route === "rules" ? (
          <Rules />
        ) : (
          <Home account={account} />
        )}
      </main>
      <footer className="foot">
        Rules live in the contracts. No owner, no admin key, no upgrade. <a href="#/rules">Read the rules</a>
      </footer>
      <Toasts />
    </>
  );
}
