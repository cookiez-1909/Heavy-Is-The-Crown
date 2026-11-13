import { useEffect, useState } from "react";

type Role = "launch" | "back" | "lost";

const STEPS: Record<Role, { go: string; goLabel: string; steps: string[] }> = {
  launch: {
    go: "#/launch",
    goLabel: "Launch a coin",
    steps: [
      "Pick a ticker. If nobody has it here, you open its bracket.",
      "Copies with the same ticker can join until registration closes.",
      "Each round, the coin that pulls in more new money, for longer, wins.",
      "Win every round and your coin holds the whole ticker's liquidity.",
    ],
  },
  back: {
    go: "#/app",
    goLabel: "See the brackets",
    steps: [
      "Open a bracket and pick the copy you believe in.",
      "Buying adds to its score. Money that arrives early counts most.",
      "Selling is taxed more as the bell gets closer, up to the loser's penalty.",
      "If your coin wins, it absorbs the loser's liquidity.",
    ],
  },
  lost: {
    go: "#/app",
    goLabel: "Find my bag",
    steps: [
      "Your coin lost its round. Its liquidity moved into the winner.",
      "Open that bracket and press Convert my bag.",
      "You get the winner's tokens: most of what your coin held comes with you.",
    ],
  },
};

const ROLES: { key: Role; title: string; text: string }[] = [
  { key: "launch", title: "Launch a coin", text: "I have a ticker in mind." },
  { key: "back", title: "Back a coin", text: "I want to pick a winner." },
  { key: "lost", title: "My coin lost", text: "I hold a coin that was absorbed." },
];

const KEY = "tb-tour-done";
export const openTour = () => window.dispatchEvent(new Event("tb-tour"));

/** First visit to the app: pick a role, then three or four short steps. Skippable, and reopened from the sidebar. */
export default function Tour() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(KEY);
    } catch {
      return false;
    }
  });
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const on = () => (setRole(null), setStep(0), setOpen(true));
    window.addEventListener("tb-tour", on);
    return () => window.removeEventListener("tb-tour", on);
  }, []);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* not remembered in private mode */
    }
  };
  if (!open) return null;
  const plan = role ? STEPS[role] : null;
  const last = plan ? step === plan.steps.length - 1 : false;

  return (
    <div className="modal-bg">
      <div className="modal tour" role="dialog" aria-modal="true" aria-label="Quick tour">
        <button className="skip" onClick={close}>
          Skip
        </button>
        {!plan ? (
          <>
            <h3>What brings you here?</h3>
            <div className="roles">
              {ROLES.map((r) => (
                <button key={r.key} onClick={() => setRole(r.key)}>
                  <b>{r.title}</b>
                  <span>{r.text}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="tourstep" key={step}>
              <span className="stepn">{step + 1}</span>
              <p>{plan.steps[step]}</p>
            </div>
            <div className="dotsrow" aria-hidden>
              {plan.steps.map((_, i) => (
                <i key={i} className={i === step ? "on" : ""} />
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => (step ? setStep(step - 1) : setRole(null))}>
                Back
              </button>
              {last ? (
                <a className="btn" href={plan.go} onClick={close}>
                  {plan.goLabel}
                </a>
              ) : (
                <button className="btn" onClick={() => setStep(step + 1)}>
                  Next
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
