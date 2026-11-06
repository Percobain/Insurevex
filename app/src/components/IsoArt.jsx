"use client";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

/**
 * Isometric line-art scenes that explain InsureVEX, one idea each:
 *   HeroArt     the conveyor: shares go in, come out with a crash floor; premiums and savers' sleeves fill the pool
 *   SaveArt     a $1,000 note splits into a T-bill floor and a sleeve; coupons come back; $1,000 back at maturity
 *   ProtectArt  prove you own the stock, pay a premium, the pool locks the max payout, the floor goes on
 *   SettleArt   the official close is posted: a crash pays the extra fall, a calm month pays the saver a coupon
 * Each scene animates only while on screen and holds one finished frame for reduced motion.
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

/** A pill label with a leader line, in screen space. */
function Tag({ at, text, tone = "", dx = 0, dy = -34, opacity = 1 }) {
  if (opacity <= 0.01) return null;
  const vb = useContext(ViewBox);
  const w = text.length * 6.3 + 20;
  const [x, y] = at;
  // Keep the pill inside the scene: slide it sideways / vertically rather than letting it hang off the edge.
  let px = x + dx - w / 2;
  let py = y + dy - 11;
  if (vb) {
    px = clamp(px, vb[0] + 6, vb[0] + vb[2] - w - 6);
    py = clamp(py, vb[1] + 6, vb[1] + vb[3] - 28);
  }
  return (
    <g className={`iso-tagpill ${tone ? `is-${tone}` : ""}`} style={{ opacity }}>
      <line x1={x} y1={y} x2={clamp(x, px + 11, px + w - 11)} y2={py + (y > py ? 22 : 0)} className="iso-leader" />
      <circle cx={x} cy={y} r="2.2" className="iso-pin" />
      <g transform={`translate(${px} ${py})`}>
        <rect width={w} height="22" rx="11" className="iso-pill" />
        <text x={w / 2} y="14.8" textAnchor="middle" className="iso-pill-text">
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
        <li key={t} className={i === active ? "is-active" : undefined}>
          <span className="n">{String(i + 1).padStart(2, "0")}</span>
          {t}
        </li>
      ))}
    </ol>
  );
}

/** The cream stage every scene sits on, with registration dots in the corners like the reference frames. */
function Stage({ children, className = "", corners = true }) {
  return (
    <div className={`iso-stage ${className}`}>
      {corners && [{ left: 9, top: 9 }, { right: 9, top: 9 }, { left: 9, bottom: 9 }, { right: 9, bottom: 9 }].map((pos, i) => (
        <span key={i} className="iso-corner" style={pos} aria-hidden="true" />
      ))}
      {children}
    </div>
  );
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

/* ───────────────────────── Hero: the conveyor ───────────────────────── */

const TICKERS = ["NVDA", "INFY", "7203", "SPY", "AAPL", "HDFC", "TSLA", "BABA", "SAP", "TCS"];

/** Little flat squares scattered around the engine, like the reference's pixel marks. Screen space. */
const PIXELS = [
  [-128, 70, ""], [-118, 80, "is-ink"], [-136, 84, ""], [120, -28, ""], [130, -18, "is-accent"], [112, -16, ""],
  [24, 128, ""], [34, 138, "is-ink"],
];

export function HeroArt() {
  const [ref, phase] = usePhase(24000, 0.08);
  const ids = useIds();
  const L = 1200;
  const items = TICKERS.map((t, i) => ({ t, x: -600 + ((phase * L + i * 120) % L) }));
  const nearest = Math.min(...items.map((it) => Math.abs(it.x)));
  const press = nearest < 24 ? smooth(1 - nearest / 24) : 0;
  const pressAge = items.map((it) => span(it.x, 0, 30)).find((a) => a > 0 && a < 1) ?? 0;

  const POOL = [85, -240];
  const SAVERS = [-215, -205];
  const premiums = items.map((it) => span(it.x, 30, 190)).filter((t) => t > 0 && t < 1);
  const sleeves = [0, 0.5].map((o) => span((phase * 7 + o) % 1, 0, 0.5)).filter((t) => t > 0 && t < 1);
  const fade = (x) => clamp((570 - Math.abs(x)) / 50);
  const poolFill = 0.6 + Math.sin(phase * Math.PI * 8) * 0.05;
  // Tiles going in are drawn under the plinth, so the plinth hides them as they slide beneath it. Tiles coming out are
  // drawn over it but clipped to the world half-space in front of the plinth's right face (x > 96).
  const before = items.filter((it) => it.x < 0);
  const after = items.filter((it) => it.x >= 0 && it.x > 64);
  const exitClip = `${ids.hatch}x`;
  const edge = [P(96, -900, 0), P(96, 900, 0)];

  const Tile = ({ it, covered }) => (
    <g style={{ opacity: fade(it.x) }}>
      <Box x={it.x - 32} y={-32} z={2} w={64} d={64} h={7} shadow />
      <Box
        x={it.x - 22}
        y={-22}
        z={9}
        w={44}
        d={44}
        h={9}
        shadow={false}
        top={
          <>
            <text x="22" y="19" textAnchor="middle" className="iso-text iso-bold">
              {it.t}
            </text>
            <rect x="7" y="26" width="13" height="8" rx="1.5" className={covered ? "iso-pixel is-accent" : "iso-pixel"} />
            <rect x="23" y="26" width="13" height="8" rx="1.5" className="iso-pixel" />
          </>
        }
        front={<rect x="0" y="0" width="9" height="9" className="iso-pixel is-accent" />}
      />
      {covered && <Cyl x={it.x + 13} y={-13} z={18} r={9} h={5} className="iso-coin is-accent" shadow={false} />}
    </g>
  );

  return (
    <Stage className="iso-bare hero-art" corners={false}>
      <IsoSvg svgRef={ref} vb={[-640,-250,1120,640]} fit="slice" role="img" aria-label="Shares from any exchange ride a conveyor into InsureVEX and come out with a crash floor. Each premium, and the savers' sleeve, flows into the underwriting pool.">
        <Defs ids={ids} />

        {/* Back: savers' sleeve and the pool */}
        <Box x={SAVERS[0] - 30} y={SAVERS[1] - 30} w={60} d={60} h={12} className="iso-sage" front={<text x="6" y="9" className="iso-mini">SAVERS</text>} />
        <Box x={SAVERS[0] - 16} y={SAVERS[1] - 16} z={12} w={32} d={32} h={14} shadow={false} topFill={`url(#${ids.hatch})`} />
        <Cyl x={POOL[0]} y={POOL[1]} r={46} h={56} />
        <Cyl x={POOL[0]} y={POOL[1]} z={56} r={38} h={2} className="iso-liquid" style={{ opacity: poolFill }} />
        {premiums.map((t, i) => (
          <Coin key={`p${i}`} at={fly([0, -24, 96], [POOL[0], POOL[1], 58], smooth(t), 70)} tone="accent" opacity={clamp(t / 0.12) * clamp((1 - t) / 0.1)} />
        ))}
        {sleeves.map((t, i) => (
          <Coin key={`s${i}`} at={fly([SAVERS[0], SAVERS[1], 28], [POOL[0], POOL[1], 58], smooth(t), 80)} tone="accent" opacity={clamp(t / 0.12) * clamp((1 - t) / 0.1)} />
        ))}

        {/* The lane */}
        <Box x={-600} y={-46} w={1200} d={92} h={2} shadow={false} />

        {before.map((it) => (
          <Tile key={it.t} it={it} />
        ))}

        {/* The engine on its plinth */}
        <Box x={-96} y={-96} w={192} d={192} h={16} className="iso-sage" />
        <Box
          x={-66}
          y={-84}
          z={16}
          w={132}
          d={112}
          h={78}
          front={
            <>
              <text x="12" y="20" className="iso-text iso-bold">INSUREVEX</text>
              <text x="12" y="33" className="iso-mini">price · lock · cover</text>
              <rect x="12" y="44" width="80" height="5" rx="2.5" className="iso-meter" />
              <rect x="12" y="44" width={18 + press * 62} height="5" rx="2.5" className="iso-meter-fill" />
            </>
          }
          top={
            <>
              {[22, 52, 82].map((v) => (
                <rect key={v} x={v} y="40" width="26" height="14" rx="7" className="iso-line" />
              ))}
              <rect x="22" y="66" width="86" height="4" rx="2" className="iso-line iso-dashed" />
            </>
          }
        />
        {/* Keys on the plinth: two teal, one orange that presses as each share goes through */}
        <Box x={-58} y={46} z={16} w={30} d={34} h={9} shadow={false} className="iso-teal" top={<path d="M9 17 H21 M15 11 L21 17 L15 23" className="iso-key-glyph" />} />
        <Box x={-22} y={46} z={16} w={30} d={34} h={9} shadow={false} className="iso-teal" top={<path d="M15 10 V24 M9 18 L15 24 L21 18" className="iso-key-glyph" />} />
        <Box x={14} y={46} z={16} w={46} d={34} h={10 - press * 5} shadow={false} className="iso-orange" top={<path d="M14 12 V22 H32 M27 17 L32 22 L27 27" className="iso-key-glyph" />} />
        <Ripple at={P(37, 63, 26 - press * 5)} age={pressAge} />
        {PIXELS.map(([x, y, c], i) => (
          <rect key={i} x={x} y={y} width="9" height="9" className={`iso-pixel ${c}`} />
        ))}

        <clipPath id={exitClip}>
          <polygon points={`${edge[0][0]},${edge[0][1] - 16} ${edge[1][0]},${edge[1][1] - 16} 2000,2000 2000,-2000`} />
        </clipPath>
        {after.map((it) => (
          <g key={it.t} clipPath={`url(#${exitClip})`}>
            <Tile it={it} covered />
            <Shield x={P(it.x, 0, 54)[0]} y={P(it.x, 0, 54)[1]} s={0.9} opacity={fade(it.x) * clamp((it.x - 120) / 50)} label="−10% floor" />
          </g>
        ))}

        <Tag at={P(-330, 0, 22)} text="shares, any exchange" dx={70} dy={-56} tone="ink" />
        <Tag at={P(440, 0, 20)} text="crash floor on" dx={-110} dy={70} tone="accent" />
        <Tag at={P(POOL[0], POOL[1], 64)} text="underwriting pool" dx={-150} dy={0} />
        <Tag at={P(SAVERS[0], SAVERS[1], 28)} text="savers' sleeve" dx={-30} dy={-30} />
      </IsoSvg>
    </Stage>
  );
}

/* ───────────────────────── 1. Save ───────────────────────── */

export function SaveArt() {
  const [ref, phase] = usePhase(12000);
  const ids = useIds();
  const SAVER = [-150, 0];
  const SPLIT = [-30, 0, 40];
  const VAULT = { x: 50, y: -125, w: 90, d: 74, h: 60 };
  const VTOP = [VAULT.x + 45, VAULT.y + 37, VAULT.h];
  const POOL = [115, 70];
  const stack = (k) => [SAVER[0], SAVER[1], 8 + k * 4];
  const pile = (k) => [VTOP[0], VTOP[1], VTOP[2] + k * 4];
  const out = smooth(span(phase, 0.95, 1));
  const grow = smooth(span(phase, 0.42, 0.76));
  const floor = 1000 / 1.12;
  const vaultValue = floor + (1000 - floor) * grow;

  const coins = [];
  for (let i = 0; i < 10; i++) {
    const sDep = 0.03 + i * 0.012;
    const dep = span(phase, sDep, sDep + 0.06);
    const sSplit = 0.22 + i * 0.012;
    const split = span(phase, sSplit, sSplit + 0.07);
    const sRet = 0.8 + i * 0.01;
    const ret = span(phase, sRet, sRet + 0.06);
    const home = stack(9 - i);
    const dest = i === 9 ? [POOL[0], POOL[1], 42] : pile(i);
    let at = null;
    let fadeIO = 1;
    if (phase < sDep) at = home;
    else if (dep < 1) (at = fly(home, SPLIT, smooth(dep), 50)), (fadeIO = 1 - span(dep, 0.8, 1));
    else if (split <= 0) at = null;
    else if (split < 1) (at = fly(SPLIT, dest, smooth(split), 60)), (fadeIO = span(split, 0, 0.2) * (i === 9 ? 1 - span(split, 0.8, 1) : 1));
    else if (i === 9) at = null;
    else if (ret <= 0) at = dest;
    else if (ret < 1) at = fly(dest, stack(i), smooth(ret), 70);
    else at = stack(i);
    coins.push({ at, tone: i === 9 && split > 0 ? "accent" : "", o: (1 - out) * fadeIO });
  }
  // The T-bill grows back the tenth coin by itself.
  const gRet = span(phase, 0.89, 0.95);
  const grown = grow <= 0 ? null : gRet <= 0 ? pile(9) : gRet < 1 ? fly(pile(9), stack(9), smooth(gRet), 70) : stack(9);
  coins.push({ at: grown, tone: "", o: (gRet > 0 ? 1 : grow) * (1 - out), ghost: gRet <= 0 });
  for (let c = 0; c < 3; c++) {
    const t = span(phase, 0.48 + c * 0.1, 0.56 + c * 0.1);
    if (t <= 0) continue;
    coins.push({ at: t < 1 ? fly([POOL[0], POOL[1], 42], [-128, 26, 8 + c * 4], smooth(t), 80) : [-128, 26, 8 + c * 4], tone: "good", o: 1 - out });
  }
  coins.sort((a, b) => (a.at && b.at ? a.at[0] + a.at[1] - (b.at[0] + b.at[1]) || a.at[2] - b.at[2] : 0));

  const active = phase < 0.2 ? 0 : phase < 0.42 ? 1 : phase < 0.78 ? 2 : phase < 0.95 ? 3 : -1;
  const vt = P(...VTOP);

  return (
    <Stage className="grid gap-4">
      <IsoSvg svgRef={ref} vb={[-250,-215,505,335]} role="img" aria-label="A saver deposits $1,000. $893 buys T-bills that grow back to $1,000; $107 joins the pool and pays coupons. At maturity the saver gets $1,000 back.">
        <Defs ids={ids} />
        <Box x={SAVER[0] - 35} y={SAVER[1] - 35} w={70} d={70} h={8} front={<text x="6" y="7" className="iso-mini">SAVER</text>} />
        <Box x={VAULT.x} y={VAULT.y} w={VAULT.w} d={VAULT.d} h={VAULT.h} topFill={`url(#${ids.dots})`} front={
          <>
            <text x="8" y="16" className="iso-mini">TOKENISED T-BILL</text>
            <text x="8" y="34" className="iso-text iso-bold">{money(vaultValue)}</text>
            <rect x="8" y="42" width="74" height="6" rx="3" className="iso-meter" />
            <rect x="8" y="42" width={74 * (vaultValue / 1000)} height="6" rx="3" className="iso-meter-fill" />
          </>
        } />
        <Box x={-60} y={-30} w={60} d={60} h={40} top={<path d="M14 30 H30 M30 30 L46 16 M30 30 L46 44" className="iso-line" />} front={<text x="6" y="14" className="iso-mini">SPLIT</text>} />
        <Cyl x={POOL[0]} y={POOL[1]} r={36} h={40} topFill={`url(#${ids.hatch})`} />

        {coins.map((c, i) => (
          <g key={i} className={c.ghost ? "iso-ghost" : ""}>
            <Coin at={c.at} tone={c.tone} opacity={c.o} />
          </g>
        ))}

        <Tag at={vt} text={`T-bill floor ${money(floor)}`} dx={-10} dy={-62} opacity={span(phase, 0.3, 0.36) * (1 - span(phase, 0.42, 0.46))} />
        <Tag at={vt} text="grows back to $1,000" dx={-10} dy={-62} tone="accent" opacity={span(phase, 0.46, 0.5) * (1 - span(phase, 0.78, 0.8))} />
        <Tag at={P(POOL[0], POOL[1], 44)} text={`sleeve ${money(1000 - floor)} → pool`} dx={40} dy={50} tone="accent" opacity={span(phase, 0.32, 0.36) * (1 - span(phase, 0.94, 0.96))} />
        <Tag at={P(-128, 26, 18)} text="+ coupons" dx={-30} dy={40} tone="good" opacity={span(phase, 0.55, 0.58) * (1 - out)} />
        <Tag at={P(SAVER[0], SAVER[1], 52)} text="$1,000 back" dx={0} dy={-36} tone="ink" opacity={span(phase, 0.9, 0.93) * (1 - out)} />
        <Tag at={P(SAVER[0], SAVER[1], 52)} text="deposit $1,000" dx={0} dy={-36} tone="ink" opacity={1 - span(phase, 0.12, 0.16)} />
      </IsoSvg>
      <Steps items={["deposit", "split: T-bill floor + sleeve", "sleeve earns coupons", "$1,000 back at maturity"]} active={active} />
    </Stage>
  );
}

/* ───────────────────────── 2. Protect ───────────────────────── */

export function ProtectArt() {
  const [ref, phase] = usePhase(11000);
  const ids = useIds();
  const STOCK = [-155, 0];
  const POOL = [105, -70];
  const CAGE = { x: 85, y: 45, w: 64, d: 64 };
  const out = smooth(span(phase, 0.94, 1));
  const drop = smooth(span(phase, 0.03, 0.14));
  const proofOk = span(phase, 0.15, 0.2);
  const prem = span(phase, 0.24, 0.4);
  const lock = smooth(span(phase, 0.44, 0.6));
  const dome = smooth(span(phase, 0.62, 0.74)) * (1 - out);
  const active = phase < 0.22 ? 0 : phase < 0.42 ? 1 : phase < 0.62 ? 2 : phase < 0.94 ? 3 : -1;

  const blockAt = fly([POOL[0], POOL[1], 56], [CAGE.x + CAGE.w / 2, CAGE.y + CAGE.d / 2, 4], lock, 50);
  const [dx, dy] = P(STOCK[0], STOCK[1], 8);
  const rx = 66 * Math.SQRT2 * C;
  const ry = 66 * Math.SQRT2 * S;
  const dh = 92 * dome;
  const domePath = `M${dx - rx} ${dy} C${dx - rx} ${dy - dh * 1.33}, ${dx + rx} ${dy - dh * 1.33}, ${dx + rx} ${dy} A${rx} ${ry} 0 0 1 ${dx - rx} ${dy} Z`;
  const cageTop = 44;

  return (
    <Stage className="grid gap-4">
      <IsoSvg svgRef={ref} vb={[-275,-235,515,345]} role="img" aria-label="A holder proves they own NVDA, pays a premium into the pool, the pool locks the maximum payout, and a crash floor covers the stock.">
        <Defs ids={ids} />
        <Box x={-225} y={-55} w={140} d={110} h={8} front={<text x="6" y="7" className="iso-mini">HOLDER</text>} />
        <Box x={STOCK[0] - 30} y={STOCK[1] - 30} z={8} w={60} d={60} h={26} top={<text x="30" y="34" textAnchor="middle" className="iso-text iso-bold">NVDA</text>} front={<text x="6" y="16" className="iso-mini">$10,000</text>} />
        {drop > 0 && (
          <Box x={-112} y={-20} z={8 + (1 - drop) * 90} w={22} d={36} h={3} style={{ opacity: 1 - out }} top={
            <>
              {[8, 14, 20].map((v) => (
                <line key={v} x1="4" x2="18" y1={v} y2={v} className="iso-line" />
              ))}
              {proofOk > 0 && <path d="M5 28 L9 32 L17 24" className="iso-tick" />}
            </>
          } />
        )}

        <Cyl x={POOL[0]} y={POOL[1]} r={44} h={56} topFill={`url(#${ids.hatch})`} />
        <Box x={CAGE.x} y={CAGE.y} w={CAGE.w} d={CAGE.d} h={4} />
        {lock > 0 && <Box x={blockAt[0] - 16} y={blockAt[1] - 16} z={blockAt[2]} w={32} d={32} h={22} className="iso-collateral" style={{ opacity: 1 - out }} />}
        <polygon points={pts([CAGE.x, CAGE.y, cageTop], [CAGE.x + CAGE.w, CAGE.y, cageTop], [CAGE.x + CAGE.w, CAGE.y + CAGE.d, cageTop], [CAGE.x, CAGE.y + CAGE.d, cageTop])} className="iso-cage" />
        {[
          [CAGE.x + CAGE.w, CAGE.y],
          [CAGE.x + CAGE.w, CAGE.y + CAGE.d],
          [CAGE.x, CAGE.y + CAGE.d],
        ].map(([x, y]) => (
          <polyline key={`${x}${y}`} points={pts([x, y, 4], [x, y, cageTop])} className="iso-cage" />
        ))}

        {prem > 0 && prem < 1 && <Coin at={fly([STOCK[0], STOCK[1], 36], [POOL[0], POOL[1], 58], smooth(prem), 90)} tone="accent" />}
        <Ripple at={P(POOL[0], POOL[1], 56)} age={span(phase, 0.4, 0.5)} />

        {dome > 0.01 && (
          <g>
            <path d={domePath} fill={`url(#${ids.hatch})`} className="iso-dome" />
            <ellipse cx={dx} cy={dy} rx={rx} ry={ry} className="iso-dome-ring" />
          </g>
        )}

        <Tag at={P(-101, -2, 14)} text="proof: owns 60 NVDA" dx={-10} dy={60} tone="good" opacity={proofOk * (1 - span(phase, 0.6, 0.64))} />
        <Tag at={P(POOL[0], POOL[1], 60)} text="premium $90 → pool" dx={-50} dy={-44} tone="accent" opacity={span(phase, 0.38, 0.42) * (1 - out)} />
        <Tag at={P(CAGE.x + CAGE.w / 2, CAGE.y + CAGE.d / 2, 30)} text="max payout $2,000 locked" dx={-120} dy={6} opacity={span(phase, 0.58, 0.62) * (1 - out)} />
        <Tag at={[dx, dy - dh]} text="pays the fall beyond 10%, up to 20%" dx={0} dy={-26} tone="accent" opacity={span(phase, 0.72, 0.76) * (1 - out)} />
      </IsoSvg>
      <Steps items={["prove you own it", "pay a premium", "pool locks the max payout", "floor is on"]} active={active} />
    </Stage>
  );
}

/* ───────────────────────── 3. Settle ───────────────────────── */

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
      <IsoSvg svgRef={ref} vb={[-262,-272,500,400]} role="img" aria-label="The official close is posted on-chain. In a crash the pool pays the holder the fall beyond the deductible; in a calm month the premium becomes the saver's coupon.">
        <Defs ids={ids} />
        <Box x={SAVER[0] - 30} y={SAVER[1] - 30} w={60} d={60} h={8} front={<text x="6" y="7" className="iso-mini">SAVER</text>} />
        <Box x={ORACLE.x - 10} y={ORACLE.y - 10} w={ORACLE.w + 20} d={30} h={6} />
        <Box x={ORACLE.x} y={ORACLE.y} z={6} w={ORACLE.w} d={ORACLE.d} h={ORACLE.h} front={
          <>
            <rect x="4" y="4" width={ORACLE.w - 8} height={ORACLE.h - 8} rx="3" className="iso-screen" />
            <text x="10" y="16" className="iso-mini">NVDA · OFFICIAL CLOSE</text>
            <line x1={X0} x2={X1} y1={yOf(-0.1)} y2={yOf(-0.1)} className="iso-guide" />
            <text x={X1} y={yOf(-0.1) - 3} textAnchor="end" className="iso-mini">deductible −10%</text>
            {crash && closed > 0 && <rect x={X0} y={yOf(-0.1)} width={X1 - X0} height={yOf(last) - yOf(-0.1)} fill={`url(#${ids.hatchBad})`} style={{ opacity: closed }} />}
            <polyline points={line.map((p) => p.join(",")).join(" ")} className={`iso-chart ${crash ? "is-bad" : "is-good"}`} />
            {tip && <circle cx={tip[0]} cy={tip[1]} r={closed > 0 ? 3.5 : 2.2} className={`iso-chart-dot ${crash ? "is-bad" : "is-good"}`} />}
          </>
        } />

        <Cyl x={POOL[0]} y={POOL[1]} r={38} h={46} topFill={`url(#${ids.hatch})`} />
        <Box x={HOLDER[0] - 45} y={HOLDER[1] - 40} w={90} d={80} h={8} front={<text x="6" y="7" className="iso-mini">HOLDER</text>} />
        <Box x={HOLDER[0] - 35} y={HOLDER[1] - 30} z={8} w={44} d={44} h={20 - holderMood * 6} topFill={holderMood > 0.5 ? `url(#${ids.hatchBad})` : undefined} top={<text x="22" y="26" textAnchor="middle" className="iso-text iso-bold">NVDA</text>} />

        {coins.map((c, i) => (
          <Coin key={i} at={c.at} tone={c.tone} opacity={1 - out} />
        ))}

        <Tag at={P(ORACLE.x + ORACLE.w / 2, ORACLE.y, ORACLE.h + 6)} text={crash ? "close −25% · posted on-chain" : "close +2% · posted on-chain"} dx={0} dy={-26} tone={crash ? "bad" : ""} opacity={closed * (1 - out)} />
        {crash ? (
          <Tag at={P(HOLDER[0], HOLDER[1], 30)} text="+$1,500 paid: 25% fall − 10%" dx={10} dy={-50} tone="good" opacity={span(h, 0.72, 0.76) * (1 - out)} />
        ) : (
          <>
            <Tag at={P(HOLDER[0], HOLDER[1], 30)} text="no claim · collateral freed" dx={10} dy={-50} opacity={span(h, 0.5, 0.54) * (1 - out)} />
            <Tag at={P(SAVER[0], SAVER[1], 14)} text="premium → saver's coupon" dx={-10} dy={60} tone="good" opacity={span(h, 0.7, 0.74) * (1 - out)} />
          </>
        )}
      </IsoSvg>
      <Steps items={["official close posted", "crash: pool pays the extra fall", "calm: premium becomes a coupon"]} active={active} />
    </Stage>
  );
}

/* ───────────────────────── Money map: where every dollar goes ───────────────────────── */

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

const ROUTES = [
  { id: "floor", path: [[-250, -40], [-250, -195], [-92, -195]], tone: "", n: 3, label: "floor $893", at: 0.35 },
  { id: "sleeve", path: [[-250, 40], [-250, 150], [-97, 150]], tone: "accent", n: 2, label: "sleeve $107", at: 0.45 },
  { id: "premium", path: [[198, 128], [14, 128]], tone: "accent", n: 2, label: "premium", at: 0.5 },
  { id: "payout", path: [[14, 172], [198, 172]], tone: "good", n: 1, label: "crash payout", at: 0.5 },
  { id: "redeem", path: [[12, -195], [245, -195], [245, -162]], tone: "", n: 2, label: "redeem T-bills", at: 0.4 },
  { id: "coupon", path: [[-40, 93], [-40, -100], [198, -100]], tone: "accent", n: 2, label: "coupons + sleeve", at: 0.6 },
];

export function MoneyMapArt() {
  const [ref, phase] = usePhase(9000, 0.3);
  const ids = useIds();
  return (
    <Stage>
      <IsoSvg svgRef={ref} vb={[-372,-285,782,545]} role="img" aria-label="Money map: the saver's deposit splits into T-bills and the pool sleeve; holders pay premiums into the pool and receive crash payouts; at maturity T-bills are redeemed and the sleeve's coupons paid.">
        <Defs ids={ids} />
        {/* Lanes on the ground */}
        {ROUTES.map((r) => (
          <g key={r.id}>
            <polyline points={pts(...r.path.map(([x, y]) => [x, y, 0]))} className="iso-lane" />
            <polyline points={pts(...r.path.map(([x, y]) => [x, y, 0]))} className={`iso-lane-dash ${r.tone ? `is-${r.tone}` : ""}`} style={{ strokeDashoffset: -phase * 60 }} />
          </g>
        ))}
        {ROUTES.flatMap((r) =>
          Array.from({ length: r.n }, (_, k) => {
            const t = (phase * (r.id === "payout" ? 1 : 2) + k / r.n) % 1;
            const [x, y] = along(r.path, t);
            const o = clamp(t / 0.08) * clamp((1 - t) / 0.08);
            return <Coin key={`${r.id}${k}`} at={[x, y, 1]} tone={r.tone} opacity={o} />;
          }),
        )}

        {/* The places, back to front */}
        <Box x={-90} y={-240} w={100} d={90} h={62} topFill={`url(#${ids.dots})`} front={<><text x="8" y="16" className="iso-mini">TOKENISED T-BILLS</text><text x="8" y="34" className="iso-text iso-bold">$893 → $1,000</text></>} />
        <Box x={200} y={-160} w={90} d={60} h={40} className="iso-sage" front={<text x="8" y="16" className="iso-mini">AT MATURITY</text>} />
        <Box x={-290} y={-40} w={80} d={80} h={10} front={<text x="6" y="8" className="iso-mini">SAVER</text>} />
        {[0, 1, 2, 3, 4].map((k) => (
          <Cyl key={k} x={-250} y={0} z={10 + k * 4} r={13} h={4} className="iso-coin" shadow={false} />
        ))}
        <Cyl x={-40} y={150} r={55} h={50} topFill={`url(#${ids.hatch})`} />
        <Box x={200} y={100} w={90} d={90} h={10} front={<text x="6" y="8" className="iso-mini">HOLDER</text>} />
        <Box x={222} y={122} z={10} w={46} d={46} h={22} shadow={false} top={<text x="23" y="27" textAnchor="middle" className="iso-text iso-bold">NVDA</text>} />

        {ROUTES.map((r) => {
          const [x, y] = along(r.path, r.at);
          return <Tag key={r.id} at={P(x, y, 0)} text={r.label} dx={0} dy={-22} tone={r.tone === "good" ? "good" : r.tone === "accent" ? "accent" : ""} />;
        })}
        <Tag at={P(-250, 0, 32)} text="deposits $1,000" dy={-40} tone="ink" />
        <Tag at={P(-40, 150, 50)} text="underwriting pool" dx={-30} dy={-50} tone="ink" />
        <Tag at={P(245, -130, 40)} text="$1,000 + sleeve value" dx={-50} dy={-40} tone="ink" />
      </IsoSvg>
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
      <IsoSvg svgRef={ref} vb={[-305,-262,580,395]} role="img" aria-label="The pool is a stack: reserve at the bottom, savers' sleeves in the middle, Pro first-loss on top. Premiums come in, each policy's max payout is locked, a claim is paid from the first-loss layer first, and unused collateral comes back.">
        <Defs ids={ids} />
        {HOLDERS.map(([x, y], i) => (
          <g key={i}>
            <Box x={x - 30} y={y - 30} w={60} d={60} h={8} front={<text x="5" y="7" className="iso-mini">HOLDER</text>} />
            <Box x={x - 16} y={y - 16} z={8} w={32} d={32} h={14} shadow={false} top={<text x="16" y="20" textAnchor="middle" className="iso-mini">{i ? "INFY" : "NVDA"}</text>} />
          </g>
        ))}
        {HOLDERS.map(([x, y], i) => {
          const t = span(phase, 0.04 + i * 0.08, 0.2 + i * 0.08);
          return t > 0 && t < 1 ? <Coin key={i} at={fly([x, y, 22], [0, 0, TOP], smooth(t), 80)} tone="accent" /> : null;
        })}

        {/* The tower: reserve, senior sleeves, Pro first-loss */}
        <Box x={-50} y={-50} w={100} d={100} h={20} className="iso-sage" front={<text x="6" y="13" className="iso-mini">RESERVE</text>} />
        <Box x={-50} y={-50} z={20} w={100} d={100} h={60} shadow={false} front={<><text x="6" y="16" className="iso-mini">SAVERS&apos; SLEEVES</text><text x="6" y="28" className="iso-mini">SENIOR</text></>} />
        <Box x={-50} y={-50} z={80} w={100} d={100} h={proH} shadow={false} className="iso-orange" topFill={`url(#${ids.hatch})`} front={proH > 16 ? <text x="6" y="12" className="iso-mini iso-on-dark">PRO FIRST-LOSS</text> : null} />

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
        <Tag at={P(137, -93, 40)} text="max payout locked per policy" dx={-20} dy={-40} tone="ink" opacity={span(phase, 0.42, 0.46) * (1 - span(phase, 0.56, 0.6))} />
        <Tag at={P(-20, -20, TOP)} text="claim paid: Pro first-loss shrinks first" dx={60} dy={-44} tone="accent" opacity={span(phase, 0.62, 0.66) * (1 - span(phase, 0.8, 0.82))} />
        <Tag at={P(137, 47, 40)} text="no claim: collateral back" dx={70} dy={40} opacity={span(phase, 0.82, 0.86) * (1 - out)} />
      </IsoSvg>
      <Steps items={["premiums in", "max payout locked", "claims hit first-loss first", "unused collateral back"]} active={active} />
    </Stage>
  );
}
