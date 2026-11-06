"use client";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

/**
 * Isometric scenes that explain InsureVEX, one idea each. Numbers follow the contracts:
 *   LayerArt    the product in one loop: Saver -> T-bills + vault units, Holder -> premium -> vault
 *   SaverArt    ProtectedNote: floor = face / (1 + r t) to T-bills, the rest buys vault units; premiums lift the unit
 *   HolderArt   CoverMarket: payout = notional x min(max(fall - deductible, 0), cap), i.e. the 10% -> 30% band
 *   SettleArt   official close at expiry: crash pays out of the vault, calm leaves the premium with savers
 *   PoolArt     UnderwritingPool: loss order premiums -> Pro LP -> savers' units; max payout locked per policy
 *   SystemArt   every contract and who touches it
 * Each scene animates only while on screen and holds one frame for reduced motion.
 */

const C = Math.cos(Math.PI / 6);
const S = 0.5;
/** World (x right-down, y left-down, z up) to screen. */
const P = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z];
const pts = (...p) => p.map(([x, y, z]) => P(x, y, z).join(",")).join(" ");

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const span = (t, a, b) => clamp((t - a) / (b - a));
/** Minimum-jerk easing: starts and stops at rest. */
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
/** A point flying from a to b in an arc. */
const fly = (a, b, t, arc = 60) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) + Math.sin(Math.PI * t) * arc];
const money = (v) => "$" + Math.round(v).toLocaleString("en-US");

/** Scene progress 0..1 at ~30 fps, restarting each time the scene scrolls into view. */
function usePhase(period, still = 0.62) {
  const ref = useRef(null);
  const [phase, setPhase] = useState(still);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pinned = new URLSearchParams(location.search).get("isophase"); // freeze a frame, e.g. ?isophase=0.5
    if (pinned !== null) return setPhase(clamp(Number(pinned) || 0, 0, 0.999));
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let t0 = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      setPhase(((now - t0) % period) / period);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        cancelAnimationFrame(raf);
        if (e.isIntersecting) {
          t0 = performance.now();
          setPhase(0);
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [period]);
  return [ref, phase];
}

function useIds() {
  const u = useId().replace(/:/g, "");
  return { hatch: `h${u}`, hatchBad: `b${u}`, dots: `d${u}` };
}

function Defs({ ids }) {
  return (
    <defs>
      <pattern id={ids.hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="4" className="iso-hatch" />
      </pattern>
      <pattern id={ids.hatchBad} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="5" className="iso-hatch-bad" />
      </pattern>
      <pattern id="iso-grain" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1.5" r="0.55" className="iso-grain-dot" />
        <circle cx="4.5" cy="3" r="0.45" className="iso-grain-dot" />
        <circle cx="2.5" cy="5.6" r="0.5" className="iso-grain-dot" />
        <circle cx="6" cy="6.2" r="0.4" className="iso-grain-dot" />
      </pattern>
      <pattern id={ids.dots} width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.9" className="iso-dot" />
      </pattern>
    </defs>
  );
}

/** A box: the top, right (+x) and front (+y) faces. `top`/`front` draw on those faces in flat coordinates. */
function Box({ x, y, z = 0, w, d, h, topFill, className = "", top, front, style, shadow = z === 0 }) {
  const zt = z + h;
  const [tx, ty] = P(x, y, zt);
  const [fx, fy] = P(x, y + d, zt);
  const right = pts([x + w, y, zt], [x + w, y + d, zt], [x + w, y + d, z], [x + w, y, z]);
  const face = pts([x, y + d, zt], [x + w, y + d, zt], [x + w, y + d, z], [x, y + d, z]);
  return (
    <g className={className} style={style}>
      {shadow && <polygon points={pts([x + 2, y + 8, z], [x + w + 8, y + 8, z], [x + w + 8, y + d + 14, z], [x + 2, y + d + 14, z])} className="iso-shadow" />}
      <polygon points={right} className="iso-side" />
      <polygon points={right} className="iso-grain" fill="url(#iso-grain)" />
      <polygon points={face} className="iso-side iso-side-front" />
      <polygon points={face} className="iso-grain" fill="url(#iso-grain)" />
      <polygon points={pts([x, y, zt], [x + w, y, zt], [x + w, y + d, zt], [x, y + d, zt])} className="iso-face" />
      {topFill && <polygon points={pts([x, y, zt], [x + w, y, zt], [x + w, y + d, zt], [x, y + d, zt])} className="iso-face" style={{ fill: topFill }} />}
      {top && <g transform={`matrix(${C} ${S} ${-C} ${S} ${tx} ${ty})`}>{top}</g>}
      {front && <g transform={`matrix(${C} ${S} 0 1 ${fx} ${fy})`}>{front}</g>}
    </g>
  );
}

/** An upright cylinder centred on (x, y), from z to z + h. */
function Cyl({ x, y, z = 0, r, h, className = "", topFill, top, style, shadow = z === 0 }) {
  const [cx, cyT] = P(x, y, z + h);
  const cyB = cyT + h;
  const rx = r * Math.SQRT2 * C;
  const ry = r * Math.SQRT2 * S;
  const [tx, ty] = P(x - r, y - r, z + h);
  return (
    <g className={className} style={style}>
      {shadow && <ellipse cx={P(x + 4, y + 12, z)[0]} cy={P(x + 4, y + 12, z)[1]} rx={rx * 1.04} ry={ry * 1.1} className="iso-shadow" />}
      <path d={`M${cx - rx} ${cyT} L${cx - rx} ${cyB} A${rx} ${ry} 0 0 0 ${cx + rx} ${cyB} L${cx + rx} ${cyT} A${rx} ${ry} 0 0 1 ${cx - rx} ${cyT} Z`} className="iso-side" />
      <path d={`M${cx - rx} ${cyT} L${cx - rx} ${cyB} A${rx} ${ry} 0 0 0 ${cx + rx} ${cyB} L${cx + rx} ${cyT} Z`} className="iso-grain" fill="url(#iso-grain)" />
      <ellipse cx={cx} cy={cyT} rx={rx} ry={ry} className="iso-face" />
      {topFill && <ellipse cx={cx} cy={cyT} rx={rx} ry={ry} className="iso-face" style={{ fill: topFill }} />}
      {top && <g transform={`matrix(${C} ${S} ${-C} ${S} ${tx} ${ty})`}>{top}</g>}
    </g>
  );
}

/** A stablecoin. tone: "" (neutral), "accent" (sleeve / premium), "good" (payout / coupon). */
function Coin({ at, tone = "", opacity = 1 }) {
  if (!at) return null;
  return <Cyl x={at[0]} y={at[1]} z={at[2]} r={11} h={4} className={`iso-coin ${tone ? `is-${tone}` : ""}`} style={{ opacity }} />;
}

/** The scene's viewBox, so labels can keep themselves inside it. */
const ViewBox = createContext(null);

/** A scene's <svg>. Stage scenes clip to their frame; labels are clamped inside it (see Tag). */
function IsoSvg({ svgRef, vb, fit, children, ...rest }) {
  return (
    <ViewBox.Provider value={fit ? null : vb}>
      <svg ref={svgRef} className={`iso ${fit ? "" : "iso-clip"}`} viewBox={vb.join(" ")} preserveAspectRatio={fit ? "xMidYMid slice" : undefined} {...rest}>
        {children}
      </svg>
    </ViewBox.Provider>
  );
}

/** A pill label with a leader line, in screen space. Clamped inside the scene's viewBox. */
function Tag({ at, text, tone = "", dx = 0, dy = -34, opacity = 1, size = "md" }) {
  const vb = useContext(ViewBox);
  if (opacity <= 0.01) return null;
  const fs = size === "lg" ? 14 : 12;
  const ph = size === "lg" ? 30 : 26;
  const w = text.length * fs * 0.55 + 24;
  const [x, y] = at;
  let px = x + dx - w / 2;
  let py = y + dy - ph / 2;
  if (vb) {
    px = clamp(px, vb[0] + 6, vb[0] + vb[2] - w - 6);
    py = clamp(py, vb[1] + 6, vb[1] + vb[3] - ph - 6);
  }
  return (
    <g className={`iso-tagpill ${tone ? `is-${tone}` : ""}`} style={{ opacity }}>
      <line x1={x} y1={y} x2={clamp(x, px + 12, px + w - 12)} y2={py + (y > py ? ph : 0)} className="iso-leader" />
      <circle cx={x} cy={y} r="2.4" className="iso-pin" />
      <g transform={`translate(${px} ${py})`}>
        <rect width={w} height={ph} rx={ph / 2} className="iso-pill" />
        <text x={w / 2} y={ph / 2 + fs * 0.36} textAnchor="middle" className="iso-pill-text" style={{ fontSize: fs }}>
          {text}
        </text>
      </g>
    </g>
  );
}

function Ripple({ at, age }) {
  if (age <= 0 || age >= 1) return null;
  const r = 8 + age * 30;
  return <ellipse cx={at[0]} cy={at[1]} rx={r} ry={r * 0.5} className="iso-ripple" style={{ opacity: 1 - age }} />;
}

/** The steps a scene acts out; the current one lights up. */
export function Steps({ items, active }) {
  return (
    <ol className="iso-steps">
      {items.map((t, i) => (
        <li key={t} className={i === active ? "is-active" : i < active ? "is-done" : undefined}>
          <span className="n">{i + 1}</span>
          {t}
        </li>
      ))}
    </ol>
  );
}

/** The cream stage every scene sits on, with registration dots in the corners like the reference frames. */
function Stage({ children, className = "" }) {
  return <div className={`iso-stage ${className}`}>{children}</div>;
}

/** A shield glyph in screen space, centred on (x, y). */
function Shield({ x, y, s = 1, opacity = 1, label }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} style={{ opacity }}>
      <path d="M0 -13 L11 -9 L11 0 C11 7 6 11 0 14 C-6 11 -11 7 -11 0 L-11 -9 Z" className="iso-shield" />
      <path d="M-5 0 L-1.5 4 L5.5 -4" className="iso-shield-tick" />
      {label && (
        <text x="16" y="4" className="iso-mini">
          {label}
        </text>
      )}
    </g>
  );
}

/* ───────────────────────── Hero: the layer between two investors ───────────────────────── */

/**
 * The whole product in one loop. Left: a Saver's $1,000 splits into T-bills ($952, grows back to $1,000) and the vault
 * ($48, bought as vault units). Right: a Holder gets a price from the engine and pays a $90 premium into the vault.
 * Centre: the vault, whose unit price rises when the premium lands. Numbers follow ProtectedNote.floorFor (5%, 1 year).
 */
export function LayerArt() {
  const [ref, phase] = usePhase(14000, 0.78);
  const ids = useIds();
  const S = [-235, 95];
  const T = [-265, -95];
  const H = [95, -235];
  const E = [190, 30];
  const VTOP = [0, 0, 72];
  const out = smooth(span(phase, 0.95, 1));
  const unit = 1 + 0.009 * smooth(span(phase, 0.58, 0.66));

  const coins = [];
  for (let i = 0; i < 10; i++) {
    const s0 = 0.05 + i * 0.012;
    const t = span(phase, s0, s0 + 0.08);
    const home = [S[0], S[1], 10 + (9 - i) * 4];
    const dest = i === 9 ? VTOP : [T[0], T[1], 50 + i * 4];
    if (i === 9 && t >= 1) continue;
    coins.push({ at: t <= 0 ? home : t < 1 ? fly(home, dest, smooth(t), 70) : dest, tone: i === 9 && t > 0 ? "good" : "", o: (1 - out) * (i === 9 ? 1 - span(t, 0.85, 1) : 1) });
  }
  const chip = span(phase, 0.26, 0.36);
  const chipAt = chip > 0 ? fly(VTOP, [S[0], S[1], 10], smooth(chip), 70) : null;
  const quote = span(phase, 0.38, 0.48);
  const prem = span(phase, 0.5, 0.6);
  const shield = smooth(span(phase, 0.62, 0.7)) * (1 - out);
  const active = phase < 0.37 ? 0 : phase < 0.58 ? 1 : 2;
  const [sx, sy] = P(H[0], H[1], 100);

  return (
    <Stage className="iso-bare">
      <IsoSvg svgRef={ref} vb={[-400, -330, 800, 480]} role="img" aria-label="A saver's $1,000 splits into $952 of T-bills and $48 of vault units. A holder pays a $90 premium into the vault for crash cover, which raises the price of every vault unit.">
        <Defs ids={ids} />
        {/* back: T-bills and the holder */}
        <Box x={T[0] - 40} y={T[1] - 40} w={80} d={80} h={50} topFill={`url(#${ids.dots})`} front={<text x="8" y="20" className="iso-text iso-bold">T-BILLS</text>} />
        <Box x={H[0] - 50} y={H[1] - 50} w={100} d={100} h={10} className="iso-sage" />
        <Box x={H[0] - 25} y={H[1] - 25} z={10} w={50} d={50} h={36} shadow={false} top={<text x="25" y="30" textAnchor="middle" className="iso-text iso-bold">NVDA</text>} />

        {/* centre: the vault */}
        <Cyl x={0} y={0} r={64} h={72} className="iso-vault" topFill={`url(#${ids.hatch})`} />
        <Ripple at={P(...VTOP)} age={span(phase, 0.6, 0.7)} />

        {/* front: the saver and the pricing engine */}
        <Box x={S[0] - 50} y={S[1] - 50} w={100} d={100} h={10} className="iso-sage" />
        <Box x={E[0] - 32} y={E[1] - 32} w={64} d={64} h={34} className="iso-teal" top={<polyline points="10,46 22,34 32,40 44,22 54,28" className="iso-key-glyph" />} />

        {coins.map((c, i) => (
          <Coin key={i} at={c.at} tone={c.tone} opacity={c.o} />
        ))}
        {chipAt && <Box x={chipAt[0] - 10} y={chipAt[1] - 10} z={chipAt[2]} w={20} d={20} h={6} shadow={false} className="iso-unit" style={{ opacity: 1 - out }} />}
        {quote > 0 && quote < 1 && <Box x={lerp(E[0], H[0], smooth(quote)) - 16} y={lerp(E[1], H[1], smooth(quote)) - 11} z={34 + Math.sin(Math.PI * quote) * 70} w={32} d={22} h={2} shadow={false} />}
        {prem > 0 && prem < 1 && <Coin at={fly([H[0], H[1], 46], VTOP, smooth(prem), 80)} tone="accent" />}
        {shield > 0.01 && <Shield x={sx} y={sy} s={1.5} opacity={shield} />}

        <Tag at={P(S[0], S[1], 12)} text="Saver" tone="ink" dx={-40} dy={50} />
        <Tag at={P(H[0], H[1], 12)} text="Holder" tone="ink" dx={60} dy={-20} />
        <Tag at={P(0, 0, 72)} text={`Vault · unit $${unit.toFixed(3)}`} tone="good" dy={-46} size="lg" />
        <Tag at={P(T[0], T[1], 50)} text="$952 → $1,000 at maturity" dx={-30} dy={-40} opacity={span(phase, 0.2, 0.26) * (1 - out)} />
        <Tag at={P(S[0], S[1], 18)} text="$48 = vault units" tone="good" dx={-10} dy={-50} opacity={span(phase, 0.34, 0.38) * (1 - out)} />
        <Tag at={P(E[0], E[1], 34)} text="engine quotes $90 / month" dx={70} dy={40} opacity={span(phase, 0.38, 0.42) * (1 - span(phase, 0.6, 0.64))} />
        <Tag at={[sx, sy - 18]} text="covered: 10% → 30% fall" tone="good" dx={50} dy={-30} opacity={shield} />
      </IsoSvg>
      <Steps items={["Saver deposits $1,000", "Holder pays $90 for cover", "The premium raises every vault unit"]} active={active} />
    </Stage>
  );
}

/* ───────────────────────── Type 1: the Saver ───────────────────────── */

const FLOOR = 1000 / 1.05; // ProtectedNote.floorFor at a 5% T-bill rate for 1 year
const SLEEVE = 1000 - FLOOR;

export function SaverArt() {
  const [ref, phase] = usePhase(14000);
  const ids = useIds();
  const S = [-170, 20];
  const SPLIT = [-50, 0, 36];
  const TB = { x: 50, y: -130, w: 90, d: 74, h: 60 };
  const TTOP = [TB.x + 45, TB.y + 37, TB.h];
  const V = [120, 85];
  const VTOP = [V[0], V[1], 48];
  const PR = [330, 60, 30];
  const out = smooth(span(phase, 0.95, 1));
  const grow = smooth(span(phase, 0.46, 0.8));
  const tb = FLOOR + (1000 - FLOOR) * grow;
  const stack = (k) => [S[0], S[1], 10 + k * 4];
  const pile = (k) => [TTOP[0], TTOP[1], TTOP[2] + k * 4];
  const arrived = [0, 1, 2].map((c) => smooth(span(phase, 0.52 + c * 0.08, 0.6 + c * 0.08)));
  const unit = 1 + 0.004 * arrived.reduce((a, b) => a + b, 0);

  const coins = [];
  for (let i = 0; i < 10; i++) {
    const d0 = 0.03 + i * 0.012;
    const dep = span(phase, d0, d0 + 0.06);
    const s0 = 0.2 + i * 0.012;
    const split = span(phase, s0, s0 + 0.07);
    const r0 = 0.82 + i * 0.008;
    const ret = span(phase, r0, r0 + 0.06);
    const home = stack(9 - i);
    const dest = i === 9 ? VTOP : pile(i);
    let at = null;
    let o = 1;
    if (phase < d0) at = home;
    else if (dep < 1) (at = fly(home, SPLIT, smooth(dep), 50)), (o = 1 - span(dep, 0.8, 1));
    else if (split <= 0) at = null;
    else if (split < 1) (at = fly(SPLIT, dest, smooth(split), 60)), (o = span(split, 0, 0.2) * (i === 9 ? 1 - span(split, 0.8, 1) : 1));
    else if (i === 9) at = null;
    else if (ret <= 0) at = dest;
    else if (ret < 1) at = fly(dest, stack(i), smooth(ret), 70);
    else at = stack(i);
    coins.push({ at, tone: i === 9 && split > 0 ? "good" : "", o: o * (1 - out) });
  }
  const gRet = span(phase, 0.9, 0.95);
  const grown = grow <= 0 ? null : gRet <= 0 ? pile(9) : gRet < 1 ? fly(pile(9), stack(9), smooth(gRet), 70) : stack(9);
  coins.push({ at: grown, tone: "", o: (gRet > 0 ? 1 : grow) * (1 - out), ghost: gRet <= 0 });
  arrived.forEach((a, c) => {
    const t = span(phase, 0.52 + c * 0.08, 0.6 + c * 0.08);
    if (t > 0 && t < 1) coins.push({ at: fly(PR, VTOP, smooth(t), 60), tone: "accent", o: clamp(t / 0.15) * clamp((1 - t) / 0.1) });
  });
  coins.sort((a, b) => (a.at && b.at ? a.at[0] + a.at[1] - (b.at[0] + b.at[1]) || a.at[2] - b.at[2] : 0));
  const chip = span(phase, 0.34, 0.42);
  const chipAt = chip > 0 ? (chip < 1 ? fly(VTOP, [S[0] + 26, S[1] + 26, 10], smooth(chip), 60) : [S[0] + 26, S[1] + 26, 10]) : null;
  const active = phase < 0.18 ? 0 : phase < 0.44 ? 1 : phase < 0.8 ? 2 : phase < 0.95 ? 3 : -1;
  const units = SLEEVE * unit;

  return (
    <Stage className="grid gap-5">
      <IsoSvg svgRef={ref} vb={[-260, -205, 520, 380]} role="img" aria-label="A saver deposits $1,000. $952 goes into T-bills that grow back to $1,000 by maturity; $48 buys vault units. Holders' premiums raise the unit price. At maturity the saver gets $1,000 plus the units.">
        <Defs ids={ids} />
        <Box x={S[0] - 40} y={S[1] - 40} w={80} d={80} h={10} className="iso-sage" />
        <Box x={TB.x} y={TB.y} w={TB.w} d={TB.d} h={TB.h} topFill={`url(#${ids.dots})`} front={
          <>
            <text x="8" y="18" className="iso-text iso-bold">T-BILLS</text>
            <text x="8" y="36" className="iso-text">{money(tb)}</text>
            <rect x="8" y="44" width="74" height="6" rx="3" className="iso-meter" />
            <rect x="8" y="44" width={74 * (tb / 1000)} height="6" rx="3" className="iso-meter-fill" />
          </>
        } />
        <Box x={SPLIT[0] - 30} y={-30} w={60} d={60} h={36} top={<path d="M14 30 H30 M30 30 L46 16 M30 30 L46 44" className="iso-line" />} />
        <Cyl x={V[0]} y={V[1]} r={44} h={48} className="iso-vault" topFill={`url(#${ids.hatch})`} />

        {coins.map((c, i) => (
          <g key={i} className={c.ghost ? "iso-ghost" : ""}>
            <Coin at={c.at} tone={c.tone} opacity={c.o} />
          </g>
        ))}
        {chipAt && <Box x={chipAt[0] - 10} y={chipAt[1] - 10} z={chipAt[2]} w={20} d={20} h={6} shadow={false} className="iso-unit" style={{ opacity: 1 - out }} />}

        <Tag at={P(S[0], S[1], 52)} text="Saver deposits $1,000" tone="ink" dy={-30} opacity={1 - span(phase, 0.14, 0.18)} />
        <Tag at={P(...TTOP)} text={`${money(FLOOR)} → T-bills`} dy={-48} opacity={span(phase, 0.3, 0.34) * (1 - span(phase, 0.44, 0.46))} />
        <Tag at={P(...TTOP)} text="grows back to $1,000 by itself" tone="good" dy={-48} opacity={span(phase, 0.46, 0.5) * (1 - span(phase, 0.8, 0.82))} />
        <Tag at={P(...VTOP)} text={`${money(SLEEVE)} → vault units`} tone="good" dx={20} dy={48} opacity={span(phase, 0.3, 0.34) * (1 - span(phase, 0.48, 0.5))} />
        <Tag at={P(...VTOP)} text={`unit price $${unit.toFixed(3)}`} tone="good" dx={20} dy={48} opacity={span(phase, 0.5, 0.52) * (1 - out)} />
        <Tag at={P(PR[0], PR[1], PR[2])} text="holders' premiums" tone="accent" dx={10} dy={-80} opacity={span(phase, 0.52, 0.56) * (1 - span(phase, 0.8, 0.84))} />
        <Tag at={P(S[0], S[1], 52)} text={`$1,000 + units worth $${units.toFixed(2)}`} tone="ink" dy={-30} opacity={span(phase, 0.9, 0.93) * (1 - out)} />
      </IsoSvg>
      <Steps items={["Deposit $1,000", "$952 to T-bills, $48 to vault units", "Premiums raise the unit price", "$1,000 back, plus the units"]} active={active} />
    </Stage>
  );
}

/* ───────────────────────── Type 2: the Holder ───────────────────────── */

/** The fall over the loop: hold at 5%, 25%, 40%, then recover. */
function fallAt(p) {
  if (p < 0.16) return 0;
  if (p < 0.34) return 0.05 * smooth(span(p, 0.16, 0.24));
  if (p < 0.58) return lerp(0.05, 0.25, smooth(span(p, 0.34, 0.44)));
  if (p < 0.84) return lerp(0.25, 0.4, smooth(span(p, 0.58, 0.68)));
  return 0.4 * (1 - smooth(span(p, 0.84, 0.94)));
}

export function HolderArt() {
  const [ref, phase] = usePhase(15000, 0.5);
  const ids = useIds();
  const H = [-195, 0];
  const RULER = { x: -40, y: -80, w: 130, d: 12, h: 172 };
  const V = [130, -165];
  const PAY = [150, 50];
  const fall = fallAt(phase);
  const payout = 10000 * Math.min(Math.max(fall - 0.1, 0), 0.2);
  const blockH = 70 * (1 - fall);
  const covered = smooth(span(phase, 0.12, 0.16));
  const prem = span(phase, 0.02, 0.12);
  const fade = 1 - smooth(span(phase, 0.86, 0.92));
  const nCoins = Math.round(payout / 250);
  const V0 = 16;
  const K = 3.6; // px per 1% fall on the ruler face
  const vAt = (pct) => V0 + pct * K;
  const marker = vAt(fall * 100);
  const active = phase < 0.16 ? 0 : phase < 0.34 ? 1 : phase < 0.58 ? 2 : phase < 0.86 ? 3 : -1;
  const state = fall < 0.1 ? `−${Math.round(fall * 100)}%: inside the first 10%, no payout` : fall < 0.3 ? `−${Math.round(fall * 100)}%: pays the ${Math.round(fall * 100) - 10}% past 10%` : `−${Math.round(fall * 100)}%: capped at 20% of $10,000`;
  const markerPt = P(RULER.x + 66, RULER.y + RULER.d, RULER.h - marker);

  return (
    <Stage className="grid gap-5">
      <IsoSvg svgRef={ref} vb={[-300, -290, 600, 410]} role="img" aria-label="A holder pays a $90 premium for cover on $10,000 of NVDA that pays the part of a fall between 10% and 30%. A 5% fall pays nothing, a 25% fall pays $1,500, a 40% fall pays the $2,000 maximum.">
        <Defs ids={ids} />
        <Cyl x={V[0]} y={V[1]} r={36} h={40} className="iso-vault" topFill={`url(#${ids.hatch})`} />
        <Box x={RULER.x} y={RULER.y} w={RULER.w} d={RULER.d} h={RULER.h} front={
          <>
            <rect x="46" y={vAt(0)} width="30" height={vAt(10) - vAt(0)} className="iso-band" />
            <rect x="46" y={vAt(10)} width="30" height={vAt(30) - vAt(10)} className="iso-band is-covered" />
            <rect x="46" y={vAt(30)} width="30" height={vAt(40) - vAt(30)} className="iso-band" />
            {[0, 10, 30, 40].map((p) => (
              <text key={p} x="40" y={vAt(p) + 4} textAnchor="end" className="iso-text">{p}%</text>
            ))}
            <text x="82" y={vAt(5) + 4} className="iso-text">you</text>
            <text x="82" y={vAt(20) + 4} className="iso-text iso-bold iso-good-text">covered</text>
            <text x="82" y={vAt(35) + 4} className="iso-text">you</text>
            <line x1="40" x2="80" y1={marker} y2={marker} className="iso-marker" />
          </>
        } />
        <Box x={H[0] - 55} y={H[1] - 55} w={110} d={110} h={10} className="iso-sage" />
        <Box x={H[0] - 25} y={H[1] - 25} z={10} w={50} d={50} h={blockH} shadow={false} top={<text x="25" y="30" textAnchor="middle" className="iso-text iso-bold">NVDA</text>} />
        {prem > 0 && prem < 1 && <Coin at={fly([H[0], H[1], 10 + blockH], [V[0], V[1], 40], smooth(prem), 90)} tone="accent" />}
        {covered > 0.01 && <Shield x={P(H[0], H[1], 10 + blockH + 34)[0]} y={P(H[0], H[1], 10 + blockH + 34)[1]} s={1.3} opacity={covered * fade + (1 - fade) * 0} />}

        <Box x={PAY[0] - 40} y={PAY[1] - 40} w={80} d={80} h={6} />
        {Array.from({ length: nCoins }, (_, k) => (
          <Coin key={k} at={[PAY[0], PAY[1], 6 + k * 4]} tone="good" opacity={fade} />
        ))}

        <Tag at={P(H[0], H[1], 10)} text={`$10,000 → ${money(10000 * (1 - fall))}`} tone="ink" dx={-20} dy={70} />
        <Tag at={P(V[0], V[1], 40)} text="$90 premium → vault" tone="accent" dx={20} dy={-36} opacity={span(phase, 0.04, 0.08) * (1 - span(phase, 0.2, 0.24))} />
        {phase > 0.16 && phase < 0.86 && <Tag at={markerPt} text={state} tone={payout > 0 ? "good" : ""} dx={150} dy={-10} />}
        <Tag at={P(PAY[0], PAY[1], 6 + Math.max(1, nCoins) * 4)} text={`payout ${money(payout)}`} tone="good" dy={-40} size="lg" opacity={fade} />
      </IsoSvg>
      <Steps items={["Pay $90 to cover a 10–30% fall", "Falls 5%: $0", "Falls 25%: $1,500", "Falls 40%: $2,000 max"]} active={active} />
    </Stage>
  );
}

/* ───────────────────────── Expiry: crash or calm ───────────────────────── */

const CRASH = [0, 0.012, -0.008, 0.004, -0.02, -0.014, -0.04, -0.03, -0.062, -0.082, -0.07, -0.112, -0.14, -0.122, -0.172, -0.2, -0.188, -0.226, -0.25];
const CALM = [0, 0.01, -0.006, 0.014, 0.02, 0.008, 0.024, 0.014, 0.004, 0.018, 0.03, 0.024, 0.01, 0.02, 0.014, 0.03, 0.024, 0.018, 0.02];

export function SettleArt() {
  const [ref, phase] = usePhase(15000, 0.36);
  const ids = useIds();
  const crash = phase < 0.5;
  const h = (phase % 0.5) / 0.5;
  const vals = crash ? CRASH : CALM;
  const ORACLE = { x: -60, y: -150, w: 150, d: 10, h: 104 };
  const POOL = [-150, 40];
  const HOLDER = [115, 55];
  const SAVER = [-215, -95];
  const out = smooth(span(h, 0.92, 1));

  // Chart on the oracle's face: flat coordinates, 150 x 104.
  const X0 = 10, X1 = 140, Y0 = 26, K = 190;
  const yOf = (v) => Y0 - v * K;
  const draw = span(h, 0.02, 0.4);
  const n = vals.length - 1;
  const upto = draw * n;
  const line = [];
  for (let i = 0; i <= Math.floor(upto); i++) line.push([lerp(X0, X1, i / n), yOf(vals[i])]);
  if (upto < n) {
    const i = Math.floor(upto), f = upto - i;
    line.push([lerp(X0, X1, (i + f) / n), yOf(lerp(vals[i], vals[i + 1] ?? vals[i], f))]);
  }
  const tip = line[line.length - 1];
  const closed = span(h, 0.42, 0.48);
  const last = vals[n];

  const coins = [];
  if (crash) {
    for (let c = 0; c < 3; c++) {
      const t = span(h, 0.5 + c * 0.06, 0.62 + c * 0.06);
      if (t > 0) coins.push({ at: t < 1 ? fly([POOL[0], POOL[1], 48], [HOLDER[0] + 20, HOLDER[1] + 18, 8 + c * 4], smooth(t), 90) : [HOLDER[0] + 20, HOLDER[1] + 18, 8 + c * 4], tone: "good" });
    }
  } else {
    const t = span(h, 0.55, 0.7);
    if (t > 0) coins.push({ at: t < 1 ? fly([POOL[0], POOL[1], 48], [SAVER[0], SAVER[1], 8], smooth(t), 70) : [SAVER[0], SAVER[1], 8], tone: "good" });
  }
  const active = h < 0.48 ? 0 : crash ? 1 : 2;
  const holderMood = crash ? span(h, 0.2, 0.4) : 0;

  return (
    <Stage className="grid gap-4">
      <IsoSvg svgRef={ref} vb={[-262,-272,500,400]} role="img" aria-label="At expiry the official close is posted on-chain. After a 25% fall the vault pays the holder $1,500. After a calm month nothing is paid and the premium stays with savers.">
        <Defs ids={ids} />
        <Box x={SAVER[0] - 30} y={SAVER[1] - 30} w={60} d={60} h={8} className="iso-sage" />
        <Box x={ORACLE.x - 10} y={ORACLE.y - 10} w={ORACLE.w + 20} d={30} h={6} />
        <Box x={ORACLE.x} y={ORACLE.y} z={6} w={ORACLE.w} d={ORACLE.d} h={ORACLE.h} front={
          <>
            <rect x="4" y="4" width={ORACLE.w - 8} height={ORACLE.h - 8} rx="3" className="iso-screen" />
            <text x="10" y="18" className="iso-text iso-bold">OFFICIAL CLOSE</text>
            <line x1={X0} x2={X1} y1={yOf(-0.1)} y2={yOf(-0.1)} className="iso-guide" />
            <text x={X1} y={yOf(-0.1) - 3} textAnchor="end" className="iso-text">−10%</text>
            {crash && closed > 0 && <rect x={X0} y={yOf(-0.1)} width={X1 - X0} height={yOf(last) - yOf(-0.1)} fill={`url(#${ids.hatchBad})`} style={{ opacity: closed }} />}
            <polyline points={line.map((p) => p.join(",")).join(" ")} className={`iso-chart ${crash ? "is-bad" : "is-good"}`} />
            {tip && <circle cx={tip[0]} cy={tip[1]} r={closed > 0 ? 3.5 : 2.2} className={`iso-chart-dot ${crash ? "is-bad" : "is-good"}`} />}
          </>
        } />

        <Cyl x={POOL[0]} y={POOL[1]} r={38} h={46} className="iso-vault" topFill={`url(#${ids.hatch})`} />
        <Box x={HOLDER[0] - 45} y={HOLDER[1] - 40} w={90} d={80} h={8} className="iso-sage" />
        <Box x={HOLDER[0] - 35} y={HOLDER[1] - 30} z={8} w={44} d={44} h={20 - holderMood * 6} topFill={holderMood > 0.5 ? `url(#${ids.hatchBad})` : undefined} top={<text x="22" y="26" textAnchor="middle" className="iso-text iso-bold">NVDA</text>} />

        {coins.map((c, i) => (
          <Coin key={i} at={c.at} tone={c.tone} opacity={1 - out} />
        ))}

        <Tag at={P(ORACLE.x + ORACLE.w / 2, ORACLE.y, ORACLE.h + 6)} text={crash ? "NVDA closed −25%" : "NVDA closed +2%"} dx={0} dy={-26} tone={crash ? "bad" : ""} opacity={closed * (1 - out)} />
        {crash ? (
          <Tag at={P(HOLDER[0], HOLDER[1], 30)} text="vault pays $1,500" dx={10} dy={-50} tone="good" size="lg" opacity={span(h, 0.72, 0.76) * (1 - out)} />
        ) : (
          <>
            <Tag at={P(HOLDER[0], HOLDER[1], 30)} text="no payout · $2,000 released" dx={10} dy={-50} opacity={span(h, 0.5, 0.54) * (1 - out)} />
            <Tag at={P(SAVER[0], SAVER[1], 14)} text="the $90 goes to savers" dx={130} dy={20} tone="good" opacity={span(h, 0.7, 0.74) * (1 - out)} />
          </>
        )}
        <Tag at={P(SAVER[0], SAVER[1], 8)} text="Saver" tone="ink" dx={-30} dy={-34} />
        <Tag at={P(HOLDER[0], HOLDER[1], 8)} text="Holder" tone="ink" dx={60} dy={40} />
        <Tag at={P(POOL[0], POOL[1], 46)} text="Vault" tone="good" dx={-40} dy={-40} />
      </IsoSvg>
      <Steps items={["Official close posted on-chain", "Crash: the vault pays $1,500", "Calm: the $90 goes to savers"]} active={active} />
    </Stage>
  );
}

/* ───────────────────────── How it all fits together ───────────────────────── */

/** Point at fraction t (by length) along a ground path of [x, y] points. */
function along(path, t) {
  const segs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let d = clamp(t) * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) return [lerp(path[i][0], path[i + 1][0], d / segs[i]), lerp(path[i][1], path[i + 1][1], d / segs[i])];
    d -= segs[i];
  }
  return path[path.length - 1];
}

/** One piece of the system, as a flat card on the ground with a drawing on its top. */
function Card({ x, y, w, d, children, dark }) {
  return <Box x={x} y={y} w={w} d={d} h={3} className={dark ? "iso-black" : ""} top={children} />;
}

/** Plates of the exploded stack, bottom to top: what each contract does, in plain words. */
const PLATES = [
  { key: "kyc", name: "KYC registry", cls: "iso-teal" },
  { key: "price", name: "Oracle: official closes", cls: "" },
  { key: "vault", name: "T-bill vault: savers' floor", cls: "" },
  { key: "pool", name: "Underwriting vault", cls: "iso-sage" },
  { key: "cover", name: "Cover market", cls: "iso-black" },
];

/** Wires on the ground between a card and the stack. `step` is when it lights up; tone says what moves on it. */
const WIRES = [
  { path: [[-160, 238], [-160, 120], [-60, 120], [-60, 82]], step: 0, tone: "good", label: "Saver deposits $1,000", below: true },
  { path: [[-40, -82], [-40, -200], [-120, -200], [-120, -268]], step: 0, tone: "good", label: "$952 → T-bills" },
  { path: [[0, 278], [0, 82]], step: 1, tone: "accent", label: "$90 premium" },
  { path: [[257, -20], [82, -20]], step: 1, tone: "ink", label: "proof of shares" },
  { path: [[120, -307], [120, -150], [40, -150], [40, -82]], step: 1, tone: "ink", label: "signed quote" },
  { path: [[160, 118], [118, 118], [118, 40], [82, 40]], step: 2, tone: "ink", label: "official close" },
  { path: [[40, 82], [40, 278]], step: 3, tone: "good", label: "crash payout $1,500" },
  { path: [[-40, 82], [-40, 160], [-125, 160], [-125, 238]], step: 3, tone: "good", label: "coupons + $1,000 at maturity", below: true },
];

const LIT = [["vault", "pool"], ["cover", "kyc"], ["price"], ["pool", "cover"]];

export function SystemArt() {
  const [ref, phase] = usePhase(16000, 0.3);
  const ids = useIds();
  const step = Math.min(3, Math.floor(phase * 4));
  const local = phase * 4 - step;
  const gap = 30 + 9 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 8));
  const zOf = (k) => k * (6 + gap);
  const PILLARS = [[-72, -72], [72, -72], [72, 72], [-72, 72]];
  const grid = [];
  for (let v = -440; v <= 440; v += 40) grid.push([[v, -440, 0], [v, 440, 0]], [[-440, v, 0], [440, v, 0]]);

  return (
    <Stage className="grid gap-4">
      <IsoSvg svgRef={ref} vb={[-500, -350, 1000, 600]} role="img" aria-label="The InsureVEX contracts as a stack: KYC registry, oracle, T-bill vault, underwriting vault and cover market, wired to the saver, the holder, T-bills, the pricing engine, broker proof and the official close.">
        <Defs ids={ids} />
        {grid.map(([a, b], i) => (
          <line key={i} x1={P(...a)[0]} y1={P(...a)[1]} x2={P(...b)[0]} y2={P(...b)[1]} className="iso-grid" />
        ))}

        {/* Wires first, so cards and the stack sit on top of their ends */}
        {WIRES.map((w, i) => {
          const on = w.step === step;
          const d = pts(...w.path.map(([x, y]) => [x, y, 0]));
          const [s0, s1] = [P(...w.path[0], 0), P(...w.path[w.path.length - 1], 0)];
          return (
            <g key={i}>
              <polyline points={d} className={`iso-wire ${on ? `is-${w.tone}` : "is-dim"}`} />
              <circle cx={s0[0]} cy={s0[1]} r="3" className="iso-node" />
              <circle cx={s1[0]} cy={s1[1]} r="3" className="iso-node" />
            </g>
          );
        })}

        {/* Cards around the stack, back to front */}
        <Card x={65} y={-373} w={110} d={66}>
          <text x="8" y="18" className="iso-text iso-bold">PRICING ENGINE</text>
          <polyline points="10,52 26,40 40,46 58,28 74,34 96,20" className="iso-chart is-good" />
        </Card>
        {[0, 1, 2, 3].map((k) => (
          <Box key={k} x={-150} y={-330} z={k * 22} w={60} d={60} h={22} shadow={k === 0} className={k === 3 ? "iso-sage" : ""} front={k === 0 ? <text x="6" y="15" className="iso-text iso-bold">T-BILLS</text> : null} />
        ))}
        <Card x={257} y={-62} w={86} d={84}>
          <text x="8" y="15" className="iso-text iso-bold">PROOF</text>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="8" y={24 + i * 18} width="10" height="10" className="iso-line" />
              <line x1="24" x2="76" y1={29 + i * 18} y2={29 + i * 18} className="iso-line" />
            </g>
          ))}
          <path d="M9.5 29 L13 33 L18 25" className="iso-tick" />
        </Card>
        <Card x={-235} y={238} w={110} d={84}>
          <circle cx="18" cy="20" r="9" className="iso-green-fill" />
          <text x="34" y="24" className="iso-text iso-bold">SAVER</text>
          <text x="10" y="58" className="iso-text iso-bold">$1,000</text>
        </Card>

        {/* The stack: plates on pillars, gently opening and closing */}
        {PLATES.map((pl, k) => {
          const z = zOf(k);
          const lit = LIT[step].includes(pl.key);
          const top = {
            kyc: <>{[30, 62, 94].map((x) => <circle key={x} cx={x} cy="40" r="9" className="iso-node" />)}<rect x="22" y="70" width="80" height="8" rx="4" className="iso-node" /></>,
            price: <polyline points="16,110 40,96 58,104 80,70 100,82 128,40" className="iso-chart is-good" />,
            vault: <>{[0, 1, 2, 3].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={22 + c * 38} y={18 + r * 30} width="30" height="20" rx="2" className="iso-line" />))}</>,
            pool: <circle cx="72" cy="72" r="42" fill={`url(#${ids.hatch})`} className="iso-line" />,
            cover: <><rect x="18" y="20" width="54" height="40" rx="4" className="iso-cut" /><circle cx="108" cy="46" r="20" className="iso-cut" /><rect x="22" y="96" width="100" height="12" rx="6" className="iso-cut" /></>,
          }[pl.key];
          return (
            <g key={pl.key}>
              <Box x={-80} y={-80} z={z} w={160} d={160} h={6} shadow={k === 0} className={`${pl.cls} ${lit && !pl.cls.includes("black") && !pl.cls.includes("teal") ? "iso-plate-lit" : ""}`} top={<g transform="translate(8 8)">{top}</g>} />
              {k < PLATES.length - 1 &&
                PILLARS.map(([x, y]) => {
                  const a = P(x, y, z + 6);
                  const b = P(x, y, zOf(k + 1));
                  return (
                    <g key={`${x}${y}`}>
                      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="iso-pillar" />
                      <ellipse cx={a[0]} cy={a[1]} rx="3" ry="1.6" className="iso-node" />
                    </g>
                  );
                })}
            </g>
          );
        })}

        <Card x={160} y={60} w={150} d={110}>
          <rect x="0" y="0" width="150" height="14" className="iso-ink-fill" />
          {[8, 16, 24].map((x) => <circle key={x} cx={x} cy="7" r="2.2" fill="#fff" />)}
          <text x="10" y="32" className="iso-text iso-bold">OFFICIAL CLOSE</text>
          <polyline points="12,48 34,52 52,46 74,62 96,70 118,86 140,92" className={`iso-chart ${step >= 2 ? "is-bad" : "is-good"}`} />
          <line x1="12" x2="140" y1="66" y2="66" className="iso-guide" />
        </Card>
        <Card x={-35} y={278} w={110} d={84}>
          <circle cx="18" cy="20" r="9" className="iso-green-fill" />
          <text x="34" y="24" className="iso-text iso-bold">HOLDER</text>
          <text x="10" y="58" className="iso-text iso-bold">$10,000 NVDA</text>
        </Card>

        {/* What is moving right now: coins for money, white blocks for information */}
        {WIRES.filter((w) => w.step === step).flatMap((w, i) =>
          [0, 1].map((k) => {
            const t = local * 1.5 - k * 0.4;
            if (t <= 0 || t >= 1) return null;
            const [x, y] = along(w.path, t);
            const o = clamp(t / 0.1) * clamp((1 - t) / 0.1);
            return w.tone === "ink" ? (
              <Box key={`${i}${k}`} x={x - 6} y={y - 6} z={0} w={12} d={12} h={8} shadow={false} className="iso-packet" style={{ opacity: o }} />
            ) : (
              <Coin key={`${i}${k}`} at={[x, y, 1]} tone={w.tone} opacity={o} />
            );
          }),
        )}

        {PLATES.map((pl, k) => (
          <Tag key={pl.key} at={P(-80, 80, zOf(k) + 3)} text={pl.name} dx={-120} dy={-4} tone={LIT[step].includes(pl.key) ? "good" : ""} />
        ))}
        {WIRES.filter((w) => w.step === step).map((w, i) => {
          // Label near the card end of the wire, away from the plate labels by the stack.
          const fromStack = Math.abs(w.path[0][0]) <= 82 && Math.abs(w.path[0][1]) <= 82;
          const [x, y] = along(w.path, fromStack ? 0.82 : 0.18);
          return <Tag key={`w${i}`} at={P(x, y, 0)} text={w.label} dx={0} dy={w.below ? 34 : -26} tone={w.tone === "accent" ? "accent" : w.tone === "good" ? "good" : "ink"} opacity={span(local, 0.05, 0.15)} />;
        })}
      </IsoSvg>
      <Steps items={["Saver deposits", "Holder buys cover", "Close is posted", "Payouts and coupons"]} active={step} />
    </Stage>
  );
}

/* ───────────────────────── The pool: tranches and collateral ───────────────────────── */

export function PoolArt() {
  const [ref, phase] = usePhase(12000);
  const ids = useIds();
  const HOLDERS = [[-235, -95], [-235, 45]];
  const CAGES = [{ x: 105, y: -125 }, { x: 105, y: 15 }];
  const out = smooth(span(phase, 0.95, 1));
  const proH = 26 - 13 * smooth(span(phase, 0.62, 0.74)) * (1 - out);
  const TOP = 20 + 60 + proH;
  const lockA = smooth(span(phase, 0.3, 0.42));
  const lockB = smooth(span(phase, 0.36, 0.48));
  const payA = span(phase, 0.58, 0.74);
  const backB = smooth(span(phase, 0.8, 0.92));
  const cageC = (c) => [c.x + 32, c.y + 32, 4];
  const active = phase < 0.28 ? 0 : phase < 0.54 ? 1 : phase < 0.78 ? 2 : phase < 0.95 ? 3 : -1;

  const blockA = payA > 0 ? null : fly([0, 0, TOP], cageC(CAGES[0]), lockA, 60);
  // Unused collateral rises well clear of the tower before dropping back onto its top, then melts into it.
  const blockB = backB > 0 ? fly(cageC(CAGES[1]), [0, 0, TOP], backB, 150) : fly([0, 0, TOP], cageC(CAGES[1]), lockB, 60);
  const blockBo = 1 - span(phase, 0.88, 0.92);
  const blockAo = 1 - span(phase, 0.54, 0.58);
  const showB = lockB > 0 && backB < 1;

  return (
    <Stage className="grid gap-4">
      <IsoSvg svgRef={ref} vb={[-305,-262,580,395]} role="img" aria-label="The underwriting vault is a stack: reserve, savers' units, and Pro LP first-loss capital on top. Premiums come in, each policy's max payout is locked, a claim is paid by Pro LP first, and unused collateral is released.">
        <Defs ids={ids} />
        {HOLDERS.map(([x, y], i) => (
          <g key={i}>
            <Box x={x - 30} y={y - 30} w={60} d={60} h={8} className="iso-sage" />
            <Box x={x - 16} y={y - 16} z={8} w={32} d={32} h={14} shadow={false} top={<text x="16" y="21" textAnchor="middle" className="iso-text iso-bold">{i ? "INFY" : "NVDA"}</text>} />
          </g>
        ))}
        {HOLDERS.map(([x, y], i) => {
          const t = span(phase, 0.04 + i * 0.08, 0.2 + i * 0.08);
          return t > 0 && t < 1 ? <Coin key={i} at={fly([x, y, 22], [0, 0, TOP], smooth(t), 80)} tone="accent" /> : null;
        })}

        {/* The tower: reserve, senior sleeves, Pro first-loss */}
        <Box x={-50} y={-50} w={100} d={100} h={20} className="iso-sage" front={<text x="6" y="14" className="iso-text iso-bold">RESERVE</text>} />
        <Box x={-50} y={-50} z={20} w={100} d={100} h={60} shadow={false} front={<text x="6" y="20" className="iso-text iso-bold">SAVERS&apos; UNITS</text>} />
        <Box x={-50} y={-50} z={80} w={100} d={100} h={proH} shadow={false} className="iso-orange" front={proH > 16 ? <text x="6" y="14" className="iso-text iso-bold iso-on-dark">PRO LP</text> : null} />

        {CAGES.map((c, i) => (
          <g key={i}>
            <Box x={c.x} y={c.y} w={64} d={64} h={4} />
            {i === 0 && blockA && lockA > 0 && <Box x={blockA[0] - 15} y={blockA[1] - 15} z={blockA[2]} w={30} d={30} h={20} shadow={false} className="iso-collateral" style={{ opacity: blockAo }} />}
            {i === 1 && showB && backB === 0 && <Box x={blockB[0] - 15} y={blockB[1] - 15} z={blockB[2]} w={30} d={30} h={20} shadow={false} className="iso-collateral" />}
            <polygon points={pts([c.x, c.y, 40], [c.x + 64, c.y, 40], [c.x + 64, c.y + 64, 40], [c.x, c.y + 64, 40])} className="iso-cage" />
            {[[c.x + 64, c.y], [c.x + 64, c.y + 64], [c.x, c.y + 64]].map(([x, y]) => (
              <polyline key={`${x}${y}`} points={pts([x, y, 4], [x, y, 40])} className="iso-cage" />
            ))}
          </g>
        ))}
        {backB > 0 && backB < 1 && <Box x={blockB[0] - 15} y={blockB[1] - 15} z={blockB[2]} w={30} d={30} h={20} shadow={false} className="iso-collateral" style={{ opacity: blockBo }} />}
        {payA > 0 && payA < 1 && <Coin at={fly(cageC(CAGES[0]), [HOLDERS[0][0], HOLDERS[0][1], 22], smooth(payA), 110)} tone="good" />}

        <Tag at={P(-20, -20, TOP)} text="premiums in" dy={-36} tone="accent" opacity={span(phase, 0.08, 0.12) * (1 - span(phase, 0.28, 0.32))} />
        <Tag at={P(137, -93, 40)} text="max payout locked" dx={-20} dy={-40} tone="good" opacity={span(phase, 0.42, 0.46) * (1 - span(phase, 0.56, 0.6))} />
        <Tag at={P(-20, -20, TOP)} text="crash: Pro LP pays first" dx={60} dy={-44} tone="accent" opacity={span(phase, 0.62, 0.66) * (1 - span(phase, 0.8, 0.82))} />
        <Tag at={P(137, 47, 40)} text="calm: collateral released" dx={70} dy={40} tone="good" opacity={span(phase, 0.82, 0.86) * (1 - out)} />
      </IsoSvg>
      <Steps items={["Premiums in", "Max payout locked", "Crash: Pro LP loses first", "Calm: collateral released"]} active={active} />
    </Stage>
  );
}
