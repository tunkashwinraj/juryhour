// The order flow as an inline, theme-aware SVG (colors from tokens via the kit CSS module).
// Two rows on wide screens are drawn in one viewBox; it scales down on phones.
import { kit } from "../for/_kit";

const STEPS: { tag: string; title: string; sub: string; who: string; strong?: boolean }[] = [
  { tag: "01", title: "You pay", sub: "Whop checkout", who: "you" },
  { tag: "02", title: "Research", sub: "Reads page, writes A + B", who: "agent" },
  { tag: "03", title: "Recruit", sub: "Screened via Terac", who: "code + Terac" },
  { tag: "04", title: "Judge", sub: "5 s per card, random", who: "real people" },
  { tag: "05", title: "Grade", sub: "Rules, then AI check", who: "code + AI" },
  { tag: "06", title: "Count", sub: "Numbers from SQL", who: "database" },
  { tag: "07", title: "Report", sub: "Quotes verified", who: "agent + code" },
  { tag: "08", title: "Verdict", sub: "Winner + copy", who: "you", strong: true },
];

const W = 210;
const H = 92;
const GAP = 40;
const PER_ROW = 4;

export function FlowDiagram() {
  const width = PER_ROW * W + (PER_ROW - 1) * GAP + 20;
  const height = 2 * H + 90;
  const pos = (i: number) => {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    return { x: 10 + col * (W + GAP), y: 10 + row * (H + 70) };
  };
  return (
    <svg
      className={kit.diagram}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby="flow-title flow-desc"
    >
      <title id="flow-title">How a JuryHour order flows</title>
      <desc id="flow-desc">
        {STEPS.map((s) => `${s.tag} ${s.title}: ${s.sub} (${s.who})`).join(". ")}.
      </desc>
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" className={kit.head} />
        </marker>
      </defs>
      {STEPS.map((s, i) => {
        const { x, y } = pos(i);
        const next = i < STEPS.length - 1 ? pos(i + 1) : null;
        let path: string | null = null;
        if (next) {
          if (next.y === y) {
            path = `M${x + W},${y + H / 2} L${next.x - 4},${next.y + H / 2}`;
          } else {
            // wrap from end of row 1 down to start of row 2
            const midY = y + H + 35;
            path = `M${x + W / 2},${y + H} L${x + W / 2},${midY} L${next.x + W / 2},${midY} L${next.x + W / 2},${next.y - 4}`;
          }
        }
        return (
          <g key={s.tag}>
            <rect x={x} y={y} width={W} height={H} rx={8} className={s.strong ? kit.boxStrong : kit.box} />
            <text x={x + 16} y={y + 24} className={kit.tag}>
              {s.tag} · {s.who.toUpperCase()}
            </text>
            <text x={x + 16} y={y + 52} className={kit.t1}>
              {s.title}
            </text>
            <text x={x + 16} y={y + 74} className={kit.t2}>
              {s.sub}
            </text>
            {path ? <path d={path} className={kit.arrow} markerEnd="url(#flow-arrow)" /> : null}
          </g>
        );
      })}
    </svg>
  );
}
