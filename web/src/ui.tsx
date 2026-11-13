import { useEffect, useState } from "react";

// ------------------------------------------------------------------- theme

export type Theme = "dark" | "light";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("hitc-theme", theme);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button className="iconbtn" onClick={toggle} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle light and dark mode">
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <rect key={a} x="11.1" y="1.6" width="1.8" height="3.6" rx="0.9" fill="currentColor" transform={`rotate(${a} 12 12)`} />
          ))}
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- confetti

const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A short burst of paper. Does nothing when the viewer asked for reduced motion. */
export function confetti(from?: { x: number; y: number }) {
  if (still()) return;
  const colors = ["#f0b43c", "#93a6ff", "#2fc495", "#ef5a63", "#ffdcef", "#dcebff"];
  const layer = document.createElement("div");
  layer.className = "confetti";
  const x0 = from?.x ?? window.innerWidth / 2;
  const y0 = from?.y ?? window.innerHeight / 3;
  for (let i = 0; i < 90; i++) {
    const p = document.createElement("i");
    const angle = Math.random() * Math.PI * 2;
    const speed = 160 + Math.random() * 360;
    p.style.left = x0 + "px";
    p.style.top = y0 + "px";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", Math.cos(angle) * speed + "px");
    p.style.setProperty("--dy", Math.sin(angle) * speed - 160 + "px");
    p.style.setProperty("--r", Math.random() * 720 - 360 + "deg");
    p.style.animationDelay = Math.random() * 80 + "ms";
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1900);
}

// ----------------------------------------------------- money-at-risk dialog

export interface RiskLine {
  label: string;
  value: string;
  tone?: "out" | "in" | "lost";
}

export interface RiskRequest {
  title: string;
  lines: RiskLine[];
  risks: string[];
  confirm: string;
}

let ask: (r: RiskRequest) => Promise<boolean> = async () => true;

/** Shows what leaves the wallet, what comes back and what can be lost; resolves true only after the viewer ticks the box and confirms. */
export const confirmRisk = (r: RiskRequest) => ask(r);

export function RiskDialog() {
  const [req, setReq] = useState<(RiskRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const [ticked, setTicked] = useState(false);
  useEffect(() => {
    ask = (r) =>
      new Promise((resolve) => {
        setTicked(false);
        setReq({ ...r, resolve });
      });
  }, []);
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };
  return (
    <div className="modal-bg" onClick={() => close(false)}>
      <div className="modal risk" role="dialog" aria-modal="true" aria-labelledby="risk-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="risk-title">{req.title}</h3>
        <dl className="riskrows">
          {req.lines.map((l) => (
            <div key={l.label} className={l.tone ?? ""}>
              <dt>{l.label}</dt>
              <dd>{l.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="risklist">
          {req.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <label className="tick">
          <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} autoFocus />
          I understand this money can be lost as described above.
        </label>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => close(false)}>
            Cancel
          </button>
          <button className="btn" disabled={!ticked} onClick={() => close(true)}>
            {req.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
