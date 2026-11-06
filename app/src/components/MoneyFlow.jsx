// Diagram of the InsureVEX money flow. Text uses ink tokens; the accent marks the earning (at-risk) path.
export default function MoneyFlow() {
  const Box = ({ x, y, w, h, title, sub, accent }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="14" fill="var(--card)" stroke={accent ? "var(--accent)" : "var(--line)"} strokeWidth={accent ? 1.6 : 1} />
      <text x={x + 16} y={y + 28} fontSize="15" fontWeight="600" fill="var(--ink)">{title}</text>
      <text x={x + 16} y={y + 50} fontSize="12" fill="var(--ink2)">{sub}</text>
    </g>
  );
  const Arrow = ({ d, label, lx, ly, accent }) => (
    <g>
      <path d={d} fill="none" stroke={accent ? "var(--accent)" : "var(--muted)"} strokeWidth="1.6" markerEnd={accent ? "url(#ah-a)" : "url(#ah)"} />
      {label && <text x={lx} y={ly} fontSize="11.5" fill="var(--ink2)" textAnchor="middle">{label}</text>}
    </g>
  );
  return (
    <div className="card p-4 sm:p-6 overflow-x-auto">
      <svg viewBox="0 0 980 300" className="w-full min-w-[720px]" role="img" aria-label="Savings split into government bonds and an earning part in the pool; stock owners pay fees into the pool and get paid in a crash">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--muted)" /></marker>
          <marker id="ah-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" /></marker>
        </defs>
        <Box x={10} y={110} w={170} h={70} title="You save" sub="$1,000" />
        <Box x={260} y={20} w={220} h={70} title="Government bonds" sub="$889 grows back to $1,000" />
        <Box x={260} y={200} w={220} h={70} title="The pool" sub="$111 earning part" accent />
        <Box x={560} y={200} w={190} h={70} title="Stock owner" sub="protects a stock" />
        <Box x={790} y={110} w={180} h={70} title="At the end" sub="$1,000 + earnings" />
        <Arrow d="M180 135 C 220 135, 220 55, 258 55" label="safe part" lx={214} ly={84} />
        <Arrow d="M180 155 C 220 155, 220 235, 258 235" label="earning part" lx={214} ly={214} accent />
        <Arrow d="M560 222 L 482 222" label="fee" lx={521} ly={214} />
        <Arrow d="M482 250 L 558 250" label="crash payout" lx={521} ly={268} accent />
        <Arrow d="M480 55 C 700 55, 760 120, 788 135" label="bonds pay back" lx={660} ly={70} />
        <Arrow d="M480 205 C 640 160, 740 160, 788 155" label="earnings" lx={640} ly={165} accent />
      </svg>
    </div>
  );
}
