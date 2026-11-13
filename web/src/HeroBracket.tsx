import { still } from "./motion";

export const COPIES = ["#2f9e62", "#1f7ae0", "#7a4fd6", "#c2452f"];
const LOOP = 9; // seconds

/** Looping bracket: liquidity runs along the lines from each loser into its winner. */
export function HeroBracket() {
  const flows: { d: string; from: number; to: number }[] = [
    { d: "M40 45 H125 V80 H210", from: 1.3, to: 2.5 },
    { d: "M40 115 H125 V80 H210", from: 1.3, to: 2.5 },
    { d: "M40 185 H125 V220 H210", from: 1.3, to: 2.5 },
    { d: "M40 255 H125 V220 H210", from: 1.3, to: 2.5 },
    { d: "M210 80 H295 V150 H380", from: 3.7, to: 4.9 },
    { d: "M210 220 H295 V150 H380", from: 3.7, to: 4.9 },
  ];
  const coin = (x: number, y: number, r: number, c: string, cls: string) => (
    <g className={`node ${cls}`} style={{ transformOrigin: `${x}px ${y}px` }}>
      <circle cx={x} cy={y} r={r} fill={c} />
      <text x={x} y={y + 1} fontSize={r * 1.05} textAnchor="middle" dominantBaseline="central">
        🐸
      </text>
    </g>
  );
  return (
    <svg className="herobracket" viewBox="0 0 430 300" role="img" aria-label="Four copies of one ticker are paired off; each loser's liquidity flows into its winner until one coin is left">
      {flows.map((f, i) => (
        <path key={i} className="wire" d={f.d} />
      ))}
      {!still &&
        flows.flatMap((f, i) =>
          [0, 0.18, 0.36].map((lag) => {
            const a = (f.from + lag) / LOOP;
            const b = (f.to + lag) / LOOP;
            return (
              <circle key={`${i}-${lag}`} r="4.5" className="drop">
                <animateMotion dur={`${LOOP}s`} repeatCount="indefinite" path={f.d} calcMode="linear" keyPoints="0;0;1;1" keyTimes={`0;${a};${b};1`} />
                <animate attributeName="opacity" dur={`${LOOP}s`} repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes={`0;${a};${a + 0.01};${b - 0.01};${b};1`} />
              </circle>
            );
          }),
        )}
      {coin(40, 45, 22, COPIES[0], "l1 loses1")}
      {coin(40, 115, 22, COPIES[1], "l1")}
      {coin(40, 185, 22, COPIES[2], "l1 loses1")}
      {coin(40, 255, 22, COPIES[3], "l1")}
      {coin(210, 80, 28, COPIES[1], "l2 loses2")}
      {coin(210, 220, 28, COPIES[3], "l2")}
      <circle className="halo" cx="380" cy="150" r="44" />
      {coin(380, 150, 36, COPIES[3], "l3")}
      <g className="svgcrown">
        <path d="M353 112 L356 90 L370 104 L380 84 L390 104 L404 90 L407 112 Z" fill="#ffd23f" stroke="#7a5c00" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="352" y="110" width="56" height="8" rx="2.5" fill="#f2b705" stroke="#7a5c00" strokeWidth="2.5" />
        <circle cx="367" cy="114" r="2.4" fill="#f0473c" />
        <circle cx="380" cy="114" r="2.4" fill="#45c486" />
        <circle cx="393" cy="114" r="2.4" fill="#f0473c" />
      </g>
    </svg>
  );
}

