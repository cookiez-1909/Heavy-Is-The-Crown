/**
 * The crown: one drawing used everywhere. With `draw` it is sketched line by
 * line (outline, tips, band, gems), colored in, and then kept alive: it floats,
 * a glint sweeps across the gold and sparkles twinkle around it.
 */
export function CrownArt({ draw = false, className = "", title }: { draw?: boolean; className?: string; title?: string }) {
  const balls: [number, number, number][] = [
    [48, 110, 14],
    [122, 68, 15],
    [200, 40, 17],
    [278, 68, 15],
    [352, 110, 14],
  ];
  const gems: [number, number, number][] = [
    [128, 208, 11],
    [272, 208, 11],
  ];
  const dots: [number, number][] = [
    [98, 267],
    [132, 273],
    [166, 277],
    [200, 278],
    [234, 277],
    [268, 273],
    [302, 267],
  ];
  const sparks: [number, number, number][] = [
    [26, 44, 1.2],
    [376, 30, 1.5],
    [388, 196, 0.9],
    [12, 214, 0.8],
    [300, 14, 0.7],
  ];
  const body = "M72 238 L48 122 L94 178 L122 82 L162 168 L200 56 L238 168 L278 82 L306 178 L352 122 L328 238 Q200 266 72 238 Z";
  const band = "M66 240 Q200 270 334 240 Q344 240 343 252 L341 268 Q340 280 328 283 Q200 308 72 283 Q60 280 59 268 L57 252 Q56 240 66 240 Z";
  const diamond = "M200 184 L217 206 L200 228 L183 206 Z";
  const star = "M0 -13 Q2 -2 13 0 Q2 2 0 13 Q-2 2 -13 0 Q-2 -2 0 -13 Z";
  const d = (s: number) => (draw ? { animationDelay: `${s}s` } : undefined);
  return (
    <svg className={`crownart ${draw ? "draw" : ""} ${className}`} viewBox="0 0 400 330" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <clipPath id="ca-body-clip">
          <path d={body} />
        </clipPath>
      </defs>
      <g className="ca-halo" fill="none" stroke="#fff" strokeWidth="21" strokeLinejoin="round" strokeLinecap="round">
        <path className="ca-line" pathLength={1} d={body} style={d(0.1)} />
        {balls.map(([x, y, r], i) => (
          <circle key={x} className="ca-line" pathLength={1} cx={x} cy={y} r={r} style={d(1.2 + i * 0.12)} />
        ))}
        <path className="ca-line" pathLength={1} d={band} style={d(1.8)} />
      </g>
      <g className="ca-fill" style={d(2.7)}>
        <path d={body} fill="#f8d23c" />
        <g clipPath="url(#ca-body-clip)">
          <path d="M262 30 L420 30 L420 300 L296 300 Z" fill="#eab02a" />
          <path d="M40 214 Q200 244 360 214 L360 280 L40 280 Z" fill="#e9a923" opacity="0.55" />
          <path d="M84 150 L97 210" stroke="#fff" strokeWidth="10" strokeLinecap="round" opacity="0.95" />
          <path d="M128 112 L136 138" stroke="#fff" strokeWidth="8" strokeLinecap="round" opacity="0.95" />
          <path className="ca-sweep" d="M-90 20 L-40 20 L-100 300 L-150 300 Z" fill="#fff" opacity="0.55" />
        </g>
        <path d={band} fill="#f3b72c" />
        {balls.map(([x, y, r]) => (
          <g key={x}>
            <circle cx={x} cy={y} r={r} fill="#f8d23c" />
            <circle cx={x - r * 0.3} cy={y - r * 0.32} r={r * 0.28} fill="#fff" opacity="0.9" />
          </g>
        ))}
        <path className="ca-gem" d={diamond} fill="#45b4ea" />
        <path d="M200 184 L217 206 L200 206 Z" fill="#8fd6f7" />
        {gems.map(([x, y, r]) => (
          <g key={x}>
            <circle className="ca-gem" cx={x} cy={y} r={r} fill="#45b4ea" />
            <circle cx={x - 3.5} cy={y - 3.5} r="3" fill="#fff" opacity="0.9" />
          </g>
        ))}
      </g>
      <g className="ca-ink" fill="none" stroke="#1a1a1a" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round">
        <path className="ca-line" pathLength={1} d={body} style={d(0.1)} />
        {balls.map(([x, y, r], i) => (
          <circle key={x} className="ca-line" pathLength={1} cx={x} cy={y} r={r} style={d(1.2 + i * 0.12)} />
        ))}
        <path className="ca-line" pathLength={1} d={band} style={d(1.8)} />
        <path className="ca-line" pathLength={1} d={diamond} strokeWidth="6.5" style={d(2.25)} />
        {gems.map(([x, y, r], i) => (
          <circle key={x} className="ca-line" pathLength={1} cx={x} cy={y} r={r} strokeWidth="6.5" style={d(2.4 + i * 0.1)} />
        ))}
      </g>
      <g className="ca-dots" style={d(2.6)}>
        {dots.map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="4.6" fill="#1a1a1a" />
        ))}
      </g>
      {draw && (
        <g className="ca-sparks">
          {sparks.map(([x, y, k], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
              <path className="ca-spark" d={star} style={{ animationDelay: `${3.1 + i * 0.55}s` }} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/** Product name in its hand-written face, with the crown. `short` shows HITC. */
export function Wordmark({ href = "#/", short = false }: { href?: string; short?: boolean }) {
  return (
    <a className="wordmark" href={href} aria-label="Heavy Is The Crown, home">
      <CrownArt />
      <span className="wm-full">{short ? "HITC" : "Heavy Is The Crown"}</span>
      {!short && <span className="wm-short">HITC</span>}
    </a>
  );
}

/** "01 ———————— /LABEL" rule that opens every section, then an optional ".. title". */
export function SectionHead({ n, label, title, children }: { n: string; label: string; title?: string; children?: React.ReactNode }) {
  return (
    <header className="sechead">
      <div className="secrule">
        <span>{n}</span>
        <i />
        <span>/{label}</span>
      </div>
      {title && (
        <h2 className="dottitle">
          <i aria-hidden />
          {title}
        </h2>
      )}
      {children}
    </header>
  );
}
