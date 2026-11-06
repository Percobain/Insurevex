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

/**
 * Scene progress 0..1 at ~30 fps, restarting each time the scene scrolls into view.
 * Returns [ref, phase, seek]; seek(p) jumps the loop to phase p and keeps playing from there.
 */
function usePhase(period, still = 0.62) {
  const ref = useRef(null);
  const [phase, setPhase] = useState(still);
  const t0Ref = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pinned = new URLSearchParams(location.search).get("isophase"); // freeze a frame, e.g. ?isophase=0.5
    if (pinned !== null) return setPhase(clamp(Number(pinned) || 0, 0, 0.999));
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      setPhase((((now - t0Ref.current) % period) + period) % period / period);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        cancelAnimationFrame(raf);
        if (e.isIntersecting) {
          t0Ref.current = performance.now();
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
  const seek = (p) => {
    const at = clamp(p, 0, 0.999);
    t0Ref.current = performance.now() - at * period;
    setPhase(at);
  };
  return [ref, phase, seek];
}

function useIds() {
  const u = useId().replace(/:/g, "");
  return { hatch: `h${u}`, hatchBad: `b${u}`, dots: `d${u}`, floor: `f${u}` };
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
      {/* soft top-down light on every side face (shared ids; identical in each scene) */}
      <linearGradient id="iso-lit-side" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f3f2ee" />
        <stop offset="1" stopColor="#e2e0d9" />
      </linearGradient>
      <linearGradient id="iso-lit-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e6e4dd" />
        <stop offset="1" stopColor="#d3d0c7" />
      </linearGradient>
      <linearGradient id="iso-soft-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#dedbd3" />
        <stop offset="0.5" stopColor="#ebe9e3" />
        <stop offset="1" stopColor="#f7f6f2" />
      </linearGradient>
      <linearGradient id="iso-pig-grad" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor="#fde9e1" />
        <stop offset="1" stopColor="#f3bfae" />
      </linearGradient>
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
  // a coin: a short disc with an inner rim ring on its face
  return <Cyl x={at[0]} y={at[1]} z={at[2]} r={11} h={4} className={`iso-coin ${tone ? `is-${tone}` : ""}`} style={{ opacity }} top={<circle cx="11" cy="11" r="7" className="iso-coin-ring" />} />;
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

/**
 * The steps a scene acts out; the current one lights up.
 * Pass `starts` (the phase each step begins at) and `onSeek` to make every step a button that jumps the scene there.
 */
export function Steps({ items, active, starts, onSeek }) {
  const go = starts && onSeek ? (i) => onSeek(starts[i] + 0.004) : null;
  return (
    <ol className="iso-steps">
      {items.map((t, i) => (
        <li key={t} className={i === active ? "is-active" : i < active ? "is-done" : undefined}>
          {go ? (
            <button type="button" onClick={() => go(i)} aria-current={i === active ? "step" : undefined} title={`Jump to step ${i + 1}`}>
              <span className="n">{i + 1}</span>
              {t}
            </button>
          ) : (
            <>
              <span className="n">{i + 1}</span>
              {t}
            </>
          )}
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

/** World points around a rounded rectangle at height z (corner radius r), clockwise from the back corner. */
function rrectPts(x, y, w, d, r, z, seg = 6) {
  const out = [];
  const corners = [[x + r, y + r, Math.PI], [x + w - r, y + r, Math.PI * 1.5], [x + w - r, y + d - r, 0], [x + r, y + d - r, Math.PI * 0.5]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
    }
  }
  return out;
}

/** Convex hull of screen points (monotone chain). */
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (const q of p.reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/**
 * A box with rounded vertical corners, shaded softly like a product render. Same drawing slots as Box:
 * `top` (flat on the top face), `front` (the lower-left face) and `right` (the lower-right face).
 */
function RBox({ x, y, z = 0, w, d, h, r = 6, className = "", top, front, right, style, shadow = z === 0 }) {
  const rr = Math.min(r, w / 2, d / 2);
  const zt = z + h;
  const topW = rrectPts(x, y, w, d, rr, zt).map((q) => P(...q));
  const botW = rrectPts(x, y, w, d, rr, z).map((q) => P(...q));
  const side = hull(topW.concat(botW)).map((q) => q.join(",")).join(" ");
  const topPoly = topW.map((q) => q.join(",")).join(" ");
  const [tx, ty] = P(x, y, zt);
  const [fx, fy] = P(x, y + d, zt);
  const [rx, ry] = P(x + w, y + d, zt);
  const [ex, ey] = P(x + w - rr + rr * Math.SQRT1_2, y + d - rr + rr * Math.SQRT1_2, zt);
  return (
    <g className={`iso-rbox ${className}`} style={style}>
      {shadow && <polygon points={rrectPts(x + 4, y + 10, w + 6, d + 6, rr + 4, z).map((q) => P(...q).join(",")).join(" ")} className="iso-shadow" />}
      <polygon points={side} className="iso-rside" />
      <line x1={ex} y1={ey} x2={ex} y2={ey + h} className="iso-redge" />
      <polygon points={topPoly} className="iso-face" />
      {top && <g transform={`matrix(${C} ${S} ${-C} ${S} ${tx} ${ty})`}>{top}</g>}
      {front && <g transform={`matrix(${C} ${S} 0 1 ${fx} ${fy})`}>{front}</g>}
      {right && <g transform={`matrix(${C} ${-S} 0 1 ${rx} ${ry})`}>{right}</g>}
    </g>
  );
}

/** A low rounded tray that a piece stands on, with an inset groove and corner screws (from the product renders). */
function Tray({ x, y, w, d, h = 7, r = 12 }) {
  const top = (
    <>
      <rect x="6" y="6" width={w - 12} height={d - 12} rx={Math.max(2, r - 5)} className="iso-groove" />
      {[[11, 11], [w - 11, 11], [w - 11, d - 11], [11, d - 11]].map(([cx, cy]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="1.8" className="iso-screw" />
      ))}
    </>
  );
  return <RBox x={x} y={y} w={w} d={d} h={h} r={r} className="iso-tray" top={top} />;
}

/** The ground: an isometric floor grid that fades out toward the frame, so pieces stand on a plane instead of floating. */
function Floor({ id, step = 30, extent = 600 }) {
  const vb = useContext(ViewBox) || [-600, -400, 1200, 800];
  const lines = [];
  for (let v = -extent; v <= extent; v += step) {
    const a = P(v, -extent), b = P(v, extent), c = P(-extent, v), e = P(extent, v);
    lines.push(<line key={`x${v}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />, <line key={`y${v}`} x1={c[0]} y1={c[1]} x2={e[0]} y2={e[1]} />);
  }
  return (
    <g>
      <defs>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.52" r="0.55">
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={id} maskUnits="userSpaceOnUse" x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]}>
          <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill={`url(#${id}g)`} />
        </mask>
      </defs>
      <g mask={`url(#${id})`} className="iso-floor">
        {lines}
      </g>
    </g>
  );
}

/* ───────────────────────── Objects: what each piece really is ───────────────────────── */

/**
 * A line on the ground joining two pieces. `on` lights it in its tone and runs the dashes toward the end of the path,
 * so the direction money or data travels is visible. Path is world [x, y] points at z = 0.
 */
function Link({ path, tone = "ink", on = false, phase = 0 }) {
  const p = pts(...path.map(([x, y]) => [x, y, 0]));
  const a = P(path[0][0], path[0][1]);
  const b = P(path[path.length - 1][0], path[path.length - 1][1]);
  return (
    <g>
      <polyline points={p} className="iso-link-bed" />
      <polyline points={p} className={`iso-link ${on ? `is-on is-${tone}` : ""}`} style={on ? { strokeDashoffset: -phase * 900 } : undefined} />
      <circle cx={a[0]} cy={a[1]} r="3.2" className="iso-link-node" />
      <circle cx={b[0]} cy={b[1]} r="3.2" className={`iso-link-node ${on ? `is-${tone}` : ""}`} />
    </g>
  );
}

/** A government bond: a bank building with steps, columns, a sign and a pediment. Centred on (x, y). */
function Bank({ x, y, w = 80, d = 70, sign = "GOV BONDS", value }) {
  const x0 = x - w / 2;
  const y0 = y - d / 2;
  const COL = 34;
  const cols = [];
  for (let k = 0; k < 4; k++) cols.push([x0 + 7 + (k * (w - 14)) / 3, y0 + d - 6]);
  for (let k = 0; k < 2; k++) cols.push([x0 + w - 6, y0 + 7 + (k * (d - 14)) / 2]);
  cols.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const zb = 10 + COL + 14;
  const R = zb + 20;
  const yF = y0 + d + 3;
  const xl = x0 - 3;
  const xr = x0 + w + 3;
  const em = P(x, yF, zb + 8);
  return (
    <g className="iso-bank">
      <RBox r={6} x={x0 - 10} y={y0 - 10} w={w + 20} d={d + 20} h={5} />
      <RBox r={4} x={x0 - 5} y={y0 - 5} z={5} w={w + 10} d={d + 10} h={5} shadow={false} />
      <Box x={x0 + 10} y={y0 + 10} z={10} w={w - 20} d={d - 20} h={COL} shadow={false} className="iso-bank-wall" front={<rect x={(w - 20) / 2 - 8} y={COL - 22} width="16" height="22" rx="1" className="iso-door" />} />
      {cols.map(([cx, cy]) => (
        <Cyl key={`${cx}${cy}`} x={cx} y={cy} z={10} r={3.6} h={COL} shadow={false} className="iso-column" />
      ))}
      <Box x={xl} y={y0 - 3} z={10 + COL} w={w + 6} d={d + 6} h={14} shadow={false} front={
        <text x={(w + 6) / 2} y="10" textAnchor="middle" className="iso-bank-sign">{value ? `${sign} · ${value}` : sign}</text>
      } />
      <polygon points={pts([xl, y0 - 3, zb], [x, y0 - 3, R], [x, yF, R], [xl, yF, zb])} className="iso-roof" />
      <polygon points={pts([x, y0 - 3, R], [xr, y0 - 3, zb], [xr, yF, zb], [x, yF, R])} className="iso-roof is-lit" />
      <polygon points={pts([xl, yF, zb], [x, yF, R], [xr, yF, zb])} className="iso-face" />
      <circle cx={em[0]} cy={em[1]} r="4" className="iso-line" />
    </g>
  );
}

/**
 * A piggy bank standing at (x, y, z), its snout pointing along +x like everything else in the scene.
 * Legs are real cylinders; the body is the egg seen from the iso angle; the snout is a disc facing +x.
 */
function Piggy({ x, y, z = 0, s = 1 }) {
  const k = s;
  const L = 11 * k; // leg height
  const at = (dx, dy, dz) => P(x + dx * k, y + dy * k, z + dz * k);
  const [bx, by] = at(0, 0, 23);
  const [nx, ny] = at(31, 0, 24);
  const [gx, gy] = at(0, 0, 0);
  const legs = [[-14, -8], [14, -8], [-14, 8], [14, 8]];
  const ear = (dy) => {
    const [ex, ey] = at(16, dy, 35);
    return `M${ex - 6 * k} ${ey + 4 * k} Q${ex - 3 * k} ${ey - 10 * k} ${ex + 1 * k} ${ey - 13 * k} Q${ex + 5 * k} ${ey - 6 * k} ${ex + 6 * k} ${ey + 3 * k} Z`;
  };
  const [tx, ty] = at(-31, 0, 27);
  const [ix, iy] = at(21, 9, 30);
  const s0 = at(-3, -6, 38.5);
  const s1 = at(-3, 6, 38.5);
  return (
    <g className="iso-piggy">
      <ellipse cx={gx + 4} cy={gy + 3} rx={38 * k} ry={14 * k} className="iso-shadow" />
      {legs.map(([dx, dy]) => (
        <Cyl key={`${dx}${dy}`} x={x + dx * k} y={y + dy * k} z={z} r={5 * k} h={L + 2 * k} shadow={false} className="iso-pig-leg" />
      ))}
      <path d={`M${tx} ${ty} c${-7 * k} ${-2 * k} ${-8 * k} ${-9 * k} ${-3 * k} ${-10 * k} c${4 * k} 0 ${4 * k} ${5 * k} ${-1 * k} ${5 * k}`} className="iso-pig-tail" />
      <path d={ear(-7)} className="iso-pig iso-pig-ear-back" />
      <path d={ear(6)} className="iso-pig" />
      <ellipse cx={bx} cy={by} rx={33 * k} ry={21 * k} transform={`rotate(28 ${bx} ${by})`} className="iso-pig" />
      <ellipse cx={bx + 2 * k} cy={by + 8 * k} rx={24 * k} ry={9 * k} transform={`rotate(28 ${bx} ${by})`} className="iso-pig-belly" />
      <g transform={`matrix(${-C} ${S} 0 -1 ${nx} ${ny})`}>
        <circle r={7.5 * k} className="iso-pig-snout" />
        <ellipse cx={-2.6 * k} cy="0" rx={1.3 * k} ry={2 * k} className="iso-ink-fill" />
        <ellipse cx={2.6 * k} cy="0" rx={1.3 * k} ry={2 * k} className="iso-ink-fill" />
      </g>
      <circle cx={ix} cy={iy} r={2.2 * k} className="iso-ink-fill" />
      <line x1={s0[0]} y1={s0[1]} x2={s1[0]} y2={s1[1]} className="iso-pig-slot" style={{ strokeWidth: 3.4 * k }} />
    </g>
  );
}

/**
 * The pool: a round coin basin on a pedestal. It is filled to the rim with coins; stacks of coins stand on top and
 * grow with `level` (0..1), and a window on the front shows how full it is.
 */
function CoinPool({ x, y, r, h, level = 0.7 }) {
  const lv = clamp(level);
  const R = r - 12;
  const spots = [[-0.45, -0.15], [0.05, -0.5], [0.4, -0.1], [-0.15, 0.2], [0.35, 0.42], [-0.5, 0.4], [0.1, -0.05]];
  const stacks = spots
    .map(([u, v], i) => ({ x: x + u * R, y: y + v * R, n: Math.max(0, Math.round(lv * 5.5 - (i % 4) * 0.9)) }))
    .filter((t) => t.n > 0)
    .sort((a, b) => a.x + a.y - (b.x + b.y));
  // the window sits on the cylinder's front-most line, facing the viewer
  const [wx, wTop] = P(x + r * Math.SQRT1_2, y + r * Math.SQRT1_2, h - 7);
  const wH = h - 16;
  const D = 2 * r;
  return (
    <g className="iso-coinpool">
      <Cyl x={x} y={y} r={r + 9} h={6} className="iso-pool-base" />
      <Cyl x={x} y={y} z={6} r={r} h={h - 6} shadow={false} top={
        <>
          <circle cx={r} cy={r} r={r - 3} className="iso-pool-fill" />
          {Array.from({ length: 26 }, (_, i) => {
            const a = i * 2.39996;
            const rad = Math.sqrt((i + 0.5) / 26) * (r - 9);
            return <circle key={i} cx={r + rad * Math.cos(a)} cy={r + rad * Math.sin(a)} r={Math.max(3.5, r * 0.085)} className="iso-pool-bed" />;
          })}
          <circle cx={r} cy={r} r={r - 3} className="iso-pool-lip" />
        </>
      } />
      {r >= 44 && (
        <g>
          <rect x={wx - 46} y={wTop + wH / 2 - 11} width="32" height="22" rx="5" className="iso-pool-badge" />
          <image href="/brand/icon.svg" x={wx - 41} y={wTop + wH / 2 - 7.5} width="22" height="15" />
        </g>
      )}
      <rect x={wx - 6} y={wTop} width="12" height={wH} rx="6" className="iso-pool-window" />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={wx + 8} x2={wx + 12} y1={wTop + wH * f} y2={wTop + wH * f} className="iso-line" />
      ))}
      <rect x={wx - 3} y={wTop + 2 + (wH - 4) * (1 - lv)} width="6" height={(wH - 4) * lv} rx="3" className="iso-pool-level" />
      {stacks.flatMap((t, i) => {
        const cr = Math.max(5.5, r * 0.11);
        return Array.from({ length: t.n }, (_, k) => (
          <Cyl key={`${i}-${k}`} x={t.x + (k % 2 ? 0.6 : -0.4)} y={t.y} z={h + k * 3.4} r={cr} h={3} shadow={false} className="iso-pool-stack" top={k === t.n - 1 ? <circle cx={cr} cy={cr} r={cr * 0.62} className="iso-coin-ring" /> : null} />
        ));
      })}
    </g>
  );
}

/**
 * A stock owner's shares: a stack of share certificates. `sheets` sets how tall the stack is (it shrinks as the price
 * falls); the top sheet shows the ticker, a seal and signature lines. `bad` marks a loss on the seal.
 */
function StockCerts({ x, y, z = 0, sheets = 10, w = 50, d = 36, ticker = "NVDA", bad = false }) {
  const h = Math.max(3, sheets * 2.6);
  const edges = (len) => Array.from({ length: Math.floor(h / 2.6) }, (_, i) => <line key={i} x1="2" x2={len - 2} y1={2.6 * (i + 1)} y2={2.6 * (i + 1)} className="iso-page-edge" />);
  return (
    <RBox x={x - w / 2} y={y - d / 2} z={z} w={w} d={d} h={h} r={2.5} shadow={z === 0} className="iso-certs"
      top={
        <>
          <rect x="3.5" y="3.5" width={w - 7} height={d - 7} rx="1.5" className="iso-cert-border" />
          <text x={w < 45 ? 6 : 8} y={w < 45 ? 11 : 14} className="iso-cert-title" style={w < 45 ? { fontSize: 6.5 } : undefined}>{ticker}</text>
          <line x1="8" x2={w - 20} y1="20" y2="20" className="iso-cert-line" />
          <line x1="8" x2={w - 24} y1="25" y2="25" className="iso-cert-line" />
          <circle cx={w - (w < 45 ? 8 : 12)} cy={d - (w < 45 ? 7 : 12)} r={w < 45 ? 3.4 : 5.5} className={`iso-cert-seal ${bad ? "is-bad" : ""}`} />
        </>
      }
      front={edges(w)}
      right={edges(d)}
    />
  );
}

/** The price calculator: a desktop screen on a stand, its face showing a price curve. Centred on (x, y). */
function Monitor({ x, y, label = "$90" }) {
  return (
    <g>
      <RBox r={8} x={x - 20} y={y - 10} w={40} d={24} h={3} />
      <Box x={x - 4} y={y - 3} z={3} w={8} d={5} h={20} shadow={false} />
      <RBox r={4} x={x - 38} y={y + 2} z={18} w={76} d={6} h={50} shadow={false} className="iso-teal" front={
        <>
          <rect x="4" y="4" width="68" height="42" rx="2" className="iso-monitor-glass" />
          <polyline points="10,36 22,26 32,31 46,16 58,21 66,11" className="iso-key-glyph" />
          <circle cx="66" cy="11" r="2.6" className="iso-green-fill" />
          <text x="10" y="17" className="iso-on-dark-mini">{label}</text>
        </>
      } />
    </g>
  );
}

/** A signpost at (x, y): a post with one arrow board per direction. `dirs` are world [dx, dy] the boards point toward. */
function Signpost({ x, y, dirs, h = 66 }) {
  const boards = dirs.map(([dx, dy], i) => {
    const n = Math.hypot(dx, dy);
    const u = [dx / n, dy / n];
    const z1 = h - 20 - i * 20;
    const z2 = z1 + 15;
    const at = (l, z) => [x + u[0] * l, y + u[1] * l, z];
    return { key: i, poly: pts(at(3, z2), at(44, z2), at(54, (z1 + z2) / 2), at(44, z1), at(3, z1)), depth: u[0] + u[1] };
  });
  const [bx, by] = P(x, y);
  const [, ty] = P(x, y, h);
  const back = boards.filter((b) => b.depth < 0);
  const front = boards.filter((b) => b.depth >= 0);
  return (
    <g>
      <ellipse cx={bx} cy={by} rx="12" ry="5" className="iso-shadow" />
      {back.map((b) => <polygon key={b.key} points={b.poly} className="iso-sign-board" />)}
      <rect x={bx - 3.5} y={ty - 4} width="7" height={by - ty + 4} rx="2" className="iso-sign-post" />
      {front.map((b) => <polygon key={b.key} points={b.poly} className="iso-sign-board" />)}
    </g>
  );
}

/** An open chest centred on (x, y): the lid leans back, coins pile on the dark opening. */
function Chest({ x, y, w = 64, d = 46, h = 26 }) {
  const x0 = x - w / 2;
  const y0 = y - d / 2;
  return (
    <g>
      <polygon points={pts([x0, y0, h], [x0 + w, y0, h], [x0 + w, y0 - 14, h + 26], [x0, y0 - 14, h + 26])} className="iso-chest-lid" />
      <RBox r={5} x={x0} y={y0} w={w} d={d} h={h} topFill="var(--iso-ink)" front={
        <>
          <line x1="0" x2={w} y1="7" y2="7" className="iso-line" />
          <rect x={w / 2 - 5} y="3" width="10" height="11" rx="2" className="iso-chest-latch" />
          <line x1="8" x2="8" y1="0" y2={h} className="iso-line" />
          <line x1={w - 8} x2={w - 8} y1="0" y2={h} className="iso-line" />
        </>
      } />
    </g>
  );
}

/** A safe on the ground at corner (x, y): a heavy box with a round dial and a handle on its door. */
function Safe({ x, y, w = 52, h = 40 }) {
  return (
    <g>
      <RBox r={6} x={x} y={y} w={w} d={w} h={h} front={
        <>
          <rect x="4" y="4" width={w - 8} height={h - 8} rx="2" className="iso-line" />
          <circle cx={w / 2 - 4} cy={h / 2} r="8" className="iso-safe-dial" />
          <path d={`M${w / 2 - 4} ${h / 2 - 8} V${h / 2 - 4} M${w / 2 + 4} ${h / 2} H${w / 2} M${w / 2 - 4} ${h / 2 + 8} V${h / 2 + 4}`} className="iso-line" />
          <rect x={w - 14} y={h / 2 - 7} width="4" height="14" rx="2" className="iso-ink-fill" />
        </>
      } />
    </g>
  );
}

/** Money set aside: a roll of coins standing at (x, y, z). */
function CoinRoll({ at, opacity = 1 }) {
  if (!at) return null;
  return (
    <g style={{ opacity }}>
      <Cyl x={at[0]} y={at[1]} z={at[2]} r={12} h={20} shadow={false} className="iso-collateral" top={<circle cx="12" cy="12" r="7.5" className="iso-coin-ring" />} />
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
  const [ref, phase, seek] = usePhase(14000, 0.78);
  const ids = useIds();
  const S = [-235, 95];
  const T = [-265, -95];
  const H = [95, -235];
  const E = [190, 30];
  const PRO = [-170, -230];
  const VTOP = [0, 0, 40];
  const out = smooth(span(phase, 0.95, 1));
  const grew = smooth(span(phase, 0.64, 0.72));
  const unit = 1 + 0.009 * grew;
  const STACK = [S[0] + 28, S[1] + 26];
  const DOOR = [T[0], T[1] + 40, 22];

  const coins = [];
  for (let i = 0; i < 10; i++) {
    const s0 = 0.05 + i * 0.012;
    const t = span(phase, s0, s0 + 0.08);
    const home = [STACK[0], STACK[1], 10 + (9 - i) * 4];
    const dest = i === 9 ? VTOP : DOOR;
    if (t >= 1) continue;
    coins.push({ at: t <= 0 ? home : fly(home, dest, smooth(t), 70), tone: i === 9 && t > 0 ? "good" : "", o: (1 - out) * (1 - span(t, 0.85, 1)) });
  }
  const banked = Math.round(span(phase, 0.05, 0.22) * 9);
  const chip = span(phase, 0.26, 0.36);
  const chipAt = chip > 0 ? fly(VTOP, [STACK[0], STACK[1], 10], smooth(chip), 70) : null;
  const LINKS = [
    { path: [[-250, 45], [-250, -45]], tone: "good", steps: [0] },
    { path: [[-185, 95], [-100, 95], [-100, 0], [-70, 0]], tone: "good", steps: [0, 3] },
    { path: [[190, 18], [190, -235], [145, -235]], tone: "ink", steps: [2] },
    { path: [[95, -185], [95, -110], [0, -110], [0, -70]], tone: "accent", steps: [2] },
    { path: [[-150, -185], [-150, -120], [-40, -120], [-40, -58]], tone: "accent", steps: [1, 3] },
  ];
  const backup = span(phase, 0.37, 0.45);
  const quote = span(phase, 0.46, 0.55);
  const prem = span(phase, 0.56, 0.64);
  const shield = smooth(span(phase, 0.68, 0.76)) * (1 - out);
  const active = phase < 0.36 ? 0 : phase < 0.46 ? 1 : phase < 0.64 ? 2 : 3;
  const [sx, sy] = P(H[0], H[1], 100);

  return (
    <Stage className="iso-bare">
      <IsoSvg svgRef={ref} vb={[-400, -330, 800, 480]} role="img" aria-label="A saver puts in $1,000: $952 goes into US government bonds and $48 into the pool's earning part. A stock owner pays a $90 fee into the pool for crash protection, which grows the earning part. A Pro adds backup money that takes any crash loss first, for a bigger share of the fees.">
        <Defs ids={ids} />
        <Floor id={ids.floor} />
        {/* lines on the ground between the pieces; the step's own lines light up */}
        {LINKS.map((l, i) => (
          <Link key={i} path={l.path} tone={l.tone} on={l.steps.includes(active)} phase={phase} />
        ))}

        {/* back: gov bonds and the stock owner */}
        <Bank x={T[0]} y={T[1]} w={80} d={70} value={banked ? money((FLOOR * banked) / 9) : undefined} />
        <Tray x={H[0] - 50} y={H[1] - 50} w={100} d={100} h={10} />
        <StockCerts x={H[0]} y={H[1]} z={10} sheets={12} />
        {/* back: the Pro, whose first-loss money sits on top of the savers' */}
        <Tray x={PRO[0] - 45} y={PRO[1] - 45} w={90} d={90} h={10} />
        <RBox r={5} x={PRO[0] - 26} y={PRO[1] - 26} z={10} w={52} d={52} h={30} shadow={false} className="iso-orange" front={<text x="9" y="19" className="iso-text iso-bold iso-on-dark">PRO</text>} />
        <CoinRoll at={[PRO[0] - 8, PRO[1] - 8, 40]} />
        <CoinRoll at={[PRO[0] + 10, PRO[1] + 8, 40]} />

        {/* centre: the pool */}
        <CoinPool x={0} y={0} r={70} h={40} level={0.5 + 0.4 * grew} />
        <Ripple at={P(...VTOP)} age={span(phase, 0.64, 0.74)} />

        {/* front: the saver and the price calculator */}
        <Tray x={S[0] - 50} y={S[1] - 50} w={100} d={100} h={10} />
        <Piggy x={S[0] - 12} y={S[1] - 14} z={10} s={1} />
        <Monitor x={E[0]} y={E[1]} />

        {coins.map((c, i) => (
          <Coin key={i} at={c.at} tone={c.tone} opacity={c.o} />
        ))}
        {chipAt && <Box x={chipAt[0] - 10} y={chipAt[1] - 10} z={chipAt[2]} w={20} d={20} h={6} shadow={false} className="iso-unit" style={{ opacity: 1 - out }} />}
        {quote > 0 && quote < 1 && <Box x={lerp(E[0], H[0], smooth(quote)) - 16} y={lerp(E[1], H[1], smooth(quote)) - 11} z={34 + Math.sin(Math.PI * quote) * 70} w={32} d={22} h={2} shadow={false} />}
        {backup > 0 && backup < 1 && <Coin at={fly([PRO[0], PRO[1], 60], VTOP, smooth(backup), 70)} tone="accent" />}
        {prem > 0 && prem < 1 && <Coin at={fly([H[0], H[1], 46], VTOP, smooth(prem), 80)} tone="accent" />}
        {shield > 0.01 && <Shield x={sx} y={sy} s={1.5} opacity={shield} />}

        <Tag at={P(S[0] - 12, S[1] - 14, 60)} text="Saver" tone="ink" dx={-40} dy={-30} />
        <Tag at={P(H[0] + 50, H[1] + 50, 10)} text="Stock owner" tone="ink" dx={50} dy={40} />
        <Tag at={P(PRO[0] + 45, PRO[1] - 45, 10)} text="Pro" tone="ink" dx={40} dy={24} />
        <Tag at={P(PRO[0], PRO[1], 60)} text="backup money · takes losses first" tone="accent" dx={70} dy={-36} opacity={span(phase, 0.37, 0.41) * (1 - out)} />
        <Tag at={P(70, 70, 0)} text={`Pool · each part worth $${unit.toFixed(3)}`} tone="good" dx={-50} dy={34} size="lg" />
        <Tag at={P(T[0], T[1], 78)} text="$952 → $1,000 at the end" dx={-30} dy={-34} opacity={span(phase, 0.2, 0.26) * (1 - out)} />
        <Tag at={P(STACK[0], STACK[1], 12)} text="$48 = earning part" tone="good" dx={60} dy={56} opacity={span(phase, 0.34, 0.38) * (1 - out)} />
        <Tag at={P(E[0], E[1] + 8, 60)} text="price: $90 a month" dx={80} dy={-20} opacity={span(phase, 0.46, 0.5) * (1 - span(phase, 0.66, 0.7))} />
        <Tag at={[sx, sy - 18]} text="protected: 10% → 30% drop" tone="good" dx={50} dy={-30} opacity={shield} />
      </IsoSvg>
      <Steps items={["Saver puts in $1,000", "Pro adds backup money", "Stock owner pays a $90 fee", "The fee grows the pool"]} active={active} starts={[0, 0.36, 0.46, 0.64]} onSeek={seek} />
    </Stage>
  );
}

/* ───────────────────────── Type 1: the Saver ───────────────────────── */

const FLOOR = 1000 / 1.05; // ProtectedNote.floorFor at a 5% T-bill rate for 1 year
const SLEEVE = 1000 - FLOOR;

export function SaverArt() {
  const [ref, phase, seek] = usePhase(14000);
  const ids = useIds();
  const S = [-170, 20];
  const SPLIT = [-50, 0, 36];
  const TB = { x: 50, y: -140, w: 90, d: 70 };
  const TTOP = [TB.x + 45, TB.y + 35, 78];
  const V = [120, 85];
  const VTOP = [V[0], V[1], 30];
  const PR = [330, 60, 30];
  const out = smooth(span(phase, 0.95, 1));
  const grow = smooth(span(phase, 0.46, 0.8));
  const tb = FLOOR + (1000 - FLOOR) * grow;
  const stack = (k) => [S[0] + 18, S[1] + 18, 10 + k * 4];
  const pile = (k) => [TTOP[0], TB.y + TB.d + 26, k * 4];
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
  const LINKS = [
    { path: [[-130, 20], [-90, 20], [-90, 0], [-72, 0]], tone: "good", steps: [0, 3] },
    { path: [[-50, -22], [-50, -46], [95, -46], [95, -60]], tone: "good", steps: [1, 3] },
    { path: [[-28, 0], [120, 0], [120, 39]], tone: "good", steps: [1] },
    { path: [[320, 85], [166, 85]], tone: "accent", steps: [2] },
  ];

  return (
    <Stage className="grid gap-5">
      <IsoSvg svgRef={ref} vb={[-260, -205, 520, 380]} role="img" aria-label="You save $1,000. $952 goes into US government bonds that grow back to $1,000 by the end date; $48 goes into the earning part. Fees from stock owners grow it. At the end you get $1,000 back plus the extra.">
        <Defs ids={ids} />
        <Floor id={ids.floor} />
        {LINKS.map((l, i) => (
          <Link key={i} path={l.path} tone={l.tone} on={l.steps.includes(active)} phase={phase} />
        ))}
        <Bank x={TB.x + TB.w / 2} y={TB.y + TB.d / 2} w={TB.w} d={TB.d} value={money(tb)} />
        <Tray x={S[0] - 40} y={S[1] - 40} w={80} d={80} h={10} />
        <Piggy x={S[0] - 14} y={S[1] - 16} z={10} s={0.8} />
        <Signpost x={SPLIT[0]} y={0} dirs={[[145, -93], [1, 0]]} />
        <CoinPool x={V[0]} y={V[1]} r={46} h={30} level={0.4 + 0.5 * (unit - 1) / 0.012} />

        {coins.map((c, i) => (
          <g key={i} className={c.ghost ? "iso-ghost" : ""}>
            <Coin at={c.at} tone={c.tone} opacity={c.o} />
          </g>
        ))}
        {chipAt && <Box x={chipAt[0] - 10} y={chipAt[1] - 10} z={chipAt[2]} w={20} d={20} h={6} shadow={false} className="iso-unit" style={{ opacity: 1 - out }} />}

        <Tag at={P(S[0] - 14, S[1] - 16, 60)} text="You save $1,000" tone="ink" dy={-30} opacity={1 - span(phase, 0.14, 0.18)} />
        <Tag at={P(...TTOP)} text={`${money(FLOOR)} → gov bonds`} dy={-30} opacity={span(phase, 0.3, 0.34) * (1 - span(phase, 0.44, 0.46))} />
        <Tag at={P(...TTOP)} text="grows back to $1,000 by itself" tone="good" dy={-30} opacity={span(phase, 0.46, 0.5) * (1 - span(phase, 0.8, 0.82))} />
        <Tag at={P(...VTOP)} text={`${money(SLEEVE)} → earning part`} tone="good" dx={20} dy={48} opacity={span(phase, 0.3, 0.34) * (1 - span(phase, 0.48, 0.5))} />
        <Tag at={P(...VTOP)} text={`part worth $${unit.toFixed(3)}`} tone="good" dx={20} dy={48} opacity={span(phase, 0.5, 0.52) * (1 - out)} />
        <Tag at={P(PR[0], PR[1], PR[2])} text="stock owners' fees" tone="accent" dx={10} dy={-80} opacity={span(phase, 0.52, 0.56) * (1 - span(phase, 0.8, 0.84))} />
        <Tag at={P(S[0] - 14, S[1] - 16, 60)} text={`$1,000 + $${units.toFixed(2)} extra`} tone="ink" dy={-30} opacity={span(phase, 0.9, 0.93) * (1 - out)} />
      </IsoSvg>
      <Steps items={["Save $1,000", "$952 to gov bonds, $48 to the earning part", "Fees grow the earning part", "$1,000 back, plus extra"]} active={active} starts={[0, 0.18, 0.44, 0.8]} onSeek={seek} />
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
  const [ref, phase, seek] = usePhase(15000, 0.5);
  const ids = useIds();
  const H = [-195, 0];
  const RULER = { x: -40, y: -80, w: 130, d: 12, h: 172 };
  const V = [100, -180];
  const PAY = [150, 50];
  const fall = fallAt(phase);
  const payout = 10000 * Math.min(Math.max(fall - 0.1, 0), 0.2);
  const blockH = 44 * (1 - fall) + 4;
  const covered = smooth(span(phase, 0.12, 0.16));
  const prem = span(phase, 0.02, 0.12);
  const fade = 1 - smooth(span(phase, 0.86, 0.92));
  const nCoins = Math.round(payout / 250);
  const V0 = 16;
  const K = 3.6; // px per 1% fall on the ruler face
  const vAt = (pct) => V0 + pct * K;
  const marker = vAt(fall * 100);
  const active = phase < 0.16 ? 0 : phase < 0.34 ? 1 : phase < 0.58 ? 2 : phase < 0.86 ? 3 : -1;
  const state = fall < 0.1 ? `−${Math.round(fall * 100)}%: under 10%, no payout` : fall < 0.3 ? `−${Math.round(fall * 100)}%: pays the ${Math.round(fall * 100) - 10}% past 10%` : `−${Math.round(fall * 100)}%: the most it pays, $2,000`;
  const markerPt = P(RULER.x + 66, RULER.y + RULER.d, RULER.h - marker);

  return (
    <Stage className="grid gap-5">
      <IsoSvg svgRef={ref} vb={[-300, -290, 600, 410]} role="img" aria-label="You own $10,000 of NVDA and pay $90 for protection. It starts paying after a 10% drop and pays up to 20%. A 5% drop pays nothing, a 25% drop pays $1,500, a 40% drop pays the most, $2,000.">
        <Defs ids={ids} />
        <Floor id={ids.floor} />
        <Link path={[[-140, -55], [-140, -180], [55, -180]]} tone="accent" on={phase < 0.16} phase={phase} />
        <Link path={[[100, -135], [100, -10], [150, -10], [150, 10]]} tone="good" on={payout > 0} phase={phase} />
        <CoinPool x={V[0]} y={V[1]} r={36} h={28} level={0.8 - 0.4 * (payout / 2000)} />
        <Box x={RULER.x} y={RULER.y} w={RULER.w} d={RULER.d} h={RULER.h} front={
          <>
            <rect x="46" y={vAt(0)} width="30" height={vAt(10) - vAt(0)} className="iso-band" />
            <rect x="46" y={vAt(10)} width="30" height={vAt(30) - vAt(10)} className="iso-band is-covered" />
            <rect x="46" y={vAt(30)} width="30" height={vAt(40) - vAt(30)} className="iso-band" />
            {[0, 10, 30, 40].map((p) => (
              <text key={p} x="40" y={vAt(p) + 4} textAnchor="end" className="iso-text">{p}%</text>
            ))}
            <text x="82" y={vAt(5) + 4} className="iso-text">you</text>
            <text x="82" y={vAt(20) + 4} className="iso-text iso-bold iso-good-text">we pay</text>
            <text x="82" y={vAt(35) + 4} className="iso-text">you</text>
            <line x1="40" x2="80" y1={marker} y2={marker} className="iso-marker" />
          </>
        } />
        <Tray x={H[0] - 55} y={H[1] - 55} w={110} d={110} h={10} />
        <StockCerts x={H[0]} y={H[1]} z={10} w={60} d={44} sheets={blockH / 2.6} bad={fall > 0.1} />
        {prem > 0 && prem < 1 && <Coin at={fly([H[0], H[1], 10 + blockH], [V[0], V[1], 28], smooth(prem), 90)} tone="accent" />}
        {covered > 0.01 && <Shield x={P(H[0], H[1], 10 + blockH + 34)[0]} y={P(H[0], H[1], 10 + blockH + 34)[1]} s={1.3} opacity={covered * fade + (1 - fade) * 0} />}

        <Chest x={PAY[0]} y={PAY[1]} />
        {Array.from({ length: nCoins }, (_, k) => (
          <Coin key={k} at={[PAY[0], PAY[1], 26 + k * 4]} tone="good" opacity={fade} />
        ))}

        <Tag at={P(H[0], H[1], 10)} text={`$10,000 → ${money(10000 * (1 - fall))}`} tone="ink" dx={-20} dy={70} />
        <Tag at={P(V[0], V[1], 28)} text="$90 fee → pool" tone="accent" dx={20} dy={-36} opacity={span(phase, 0.04, 0.08) * (1 - span(phase, 0.2, 0.24))} />
        {phase > 0.16 && phase < 0.86 && <Tag at={markerPt} text={state} tone={payout > 0 ? "good" : ""} dx={150} dy={-10} />}
        <Tag at={P(PAY[0], PAY[1], 26 + Math.max(1, nCoins) * 4)} text={`you get ${money(payout)}`} tone="good" dy={-40} size="lg" opacity={fade} />
      </IsoSvg>
      <Steps items={["Pay $90 for protection", "Drops 5%: $0", "Drops 25%: you get $1,500", "Drops 40%: you get $2,000 max"]} active={active} starts={[0, 0.16, 0.34, 0.58]} onSeek={seek} />
    </Stage>
  );
}

/* ───────────────────────── Expiry: crash or calm ───────────────────────── */

const CRASH = [0, 0.012, -0.008, 0.004, -0.02, -0.014, -0.04, -0.03, -0.062, -0.082, -0.07, -0.112, -0.14, -0.122, -0.172, -0.2, -0.188, -0.226, -0.25];
const CALM = [0, 0.01, -0.006, 0.014, 0.02, 0.008, 0.024, 0.014, 0.004, 0.018, 0.03, 0.024, 0.01, 0.02, 0.014, 0.03, 0.024, 0.018, 0.02];

export function SettleArt() {
  const [ref, phase, seek] = usePhase(15000, 0.36);
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
      if (t > 0) coins.push({ at: t < 1 ? fly([POOL[0], POOL[1], 30], [HOLDER[0] + 28, HOLDER[1] + 24, 8 + c * 4], smooth(t), 90) : [HOLDER[0] + 28, HOLDER[1] + 24, 8 + c * 4], tone: "good" });
    }
  } else {
    const t = span(h, 0.55, 0.7);
    if (t > 0) coins.push({ at: t < 1 ? fly([POOL[0], POOL[1], 30], [SAVER[0] + 18, SAVER[1] + 18, 8], smooth(t), 70) : [SAVER[0] + 18, SAVER[1] + 18, 8], tone: "good" });
  }
  const active = h < 0.48 ? 0 : crash ? 1 : 2;
  const holderMood = crash ? span(h, 0.2, 0.4) : 0;

  return (
    <Stage className="grid gap-4">
      <IsoSvg svgRef={ref} vb={[-262,-272,500,400]} role="img" aria-label="On the end date the stock exchange's closing price is recorded. After a 25% drop the pool pays the stock owner $1,500 automatically. With no crash nothing is paid and the fee goes to savers.">
        <Defs ids={ids} />
        <Floor id={ids.floor} />
        <Link path={[[-70, -124], [-70, 20], [-112, 20]]} tone="ink" on={h < 0.48} phase={h} />
        <Link path={[[-112, 56], [70, 56]]} tone="good" on={crash && h >= 0.48} phase={h} />
        <Link path={[[-150, 2], [-150, -95], [-185, -95]]} tone="good" on={!crash && h >= 0.48} phase={h} />
        <Tray x={SAVER[0] - 32} y={SAVER[1] - 32} w={64} d={64} h={8} />
        <Piggy x={SAVER[0] - 4} y={SAVER[1] - 4} z={8} s={0.62} />
        <Box x={ORACLE.x - 10} y={ORACLE.y - 10} w={ORACLE.w + 20} d={30} h={6} />
        <Box x={ORACLE.x} y={ORACLE.y} z={6} w={ORACLE.w} d={ORACLE.d} h={ORACLE.h} front={
          <>
            <rect x="4" y="4" width={ORACLE.w - 8} height={ORACLE.h - 8} rx="3" className="iso-screen" />
            <text x="10" y="18" className="iso-text iso-bold">CLOSING PRICE</text>
            <line x1={X0} x2={X1} y1={yOf(-0.1)} y2={yOf(-0.1)} className="iso-guide" />
            <text x={X1} y={yOf(-0.1) - 3} textAnchor="end" className="iso-text">−10%</text>
            {crash && closed > 0 && <rect x={X0} y={yOf(-0.1)} width={X1 - X0} height={yOf(last) - yOf(-0.1)} fill={`url(#${ids.hatchBad})`} style={{ opacity: closed }} />}
            <polyline points={line.map((p) => p.join(",")).join(" ")} className={`iso-chart ${crash ? "is-bad" : "is-good"}`} />
            {tip && <circle cx={tip[0]} cy={tip[1]} r={closed > 0 ? 3.5 : 2.2} className={`iso-chart-dot ${crash ? "is-bad" : "is-good"}`} />}
          </>
        } />

        <CoinPool x={POOL[0]} y={POOL[1]} r={38} h={30} level={crash ? 0.8 - 0.4 * span(h, 0.5, 0.74) : 0.6 + 0.3 * span(h, 0.55, 0.7)} />
        <Tray x={HOLDER[0] - 45} y={HOLDER[1] - 40} w={90} d={80} h={8} />
        <StockCerts x={HOLDER[0] - 10} y={HOLDER[1] - 4} z={8} sheets={crash ? 12 - holderMood * 6 : 12} bad={crash && holderMood > 0.3} />

        {coins.map((c, i) => (
          <Coin key={i} at={c.at} tone={c.tone} opacity={1 - out} />
        ))}

        <Tag at={P(ORACLE.x + ORACLE.w / 2, ORACLE.y, ORACLE.h + 6)} text={crash ? "NVDA closed −25%" : "NVDA closed +2%"} dx={0} dy={-26} tone={crash ? "bad" : ""} opacity={closed * (1 - out)} />
        {crash ? (
          <Tag at={P(HOLDER[0], HOLDER[1], 30)} text="pool pays $1,500" dx={10} dy={-50} tone="good" size="lg" opacity={span(h, 0.72, 0.76) * (1 - out)} />
        ) : (
          <>
            <Tag at={P(HOLDER[0], HOLDER[1], 30)} text="no crash · $2,000 freed up" dx={10} dy={-50} opacity={span(h, 0.5, 0.54) * (1 - out)} />
            <Tag at={P(SAVER[0], SAVER[1], 14)} text="the $90 goes to savers" dx={130} dy={20} tone="good" opacity={span(h, 0.7, 0.74) * (1 - out)} />
          </>
        )}
        <Tag at={P(SAVER[0] - 4, SAVER[1] - 4, 40)} text="Savers" tone="ink" dx={-90} dy={-6} />
        <Tag at={P(HOLDER[0], HOLDER[1], 8)} text="Stock owner" tone="ink" dx={60} dy={40} />
        <Tag at={P(POOL[0], POOL[1], 30)} text="Pool" tone="good" dx={-40} dy={-40} />
      </IsoSvg>
      <Steps items={["Closing price is recorded", "Crash: the pool pays $1,500", "No crash: the $90 goes to savers"]} active={active} starts={[0, 0.24, 0.74]} onSeek={seek} />
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

/** Plates of the stack, bottom to top: each contract and what it does. */
const PLATES = [
  { key: "kyc", name: "ID check", role: "only verified wallets", cls: "iso-teal" },
  { key: "price", name: "Price feed", role: "stock closing prices", cls: "" },
  { key: "vault", name: "Gov bonds", role: "keeps savers' $1,000 safe", cls: "" },
  { key: "pool", name: "Pool", role: "earns fees, pays crashes", cls: "iso-sage" },
  { key: "cover", name: "Protection", role: "sells and pays protection", cls: "iso-black" },
];

/** Who is outside the stack, placed around it on the ground (world coordinates of each card's centre). */
const CARDS = {
  tbills: { at: [-294, -6], title: "Gov bonds" },
  saver: { at: [-186, 206], w: 110, d: 84, title: "You save $1,000", tone: "ink" },
  holder: { at: [26, 314], w: 110, d: 84, title: "You own $10,000 NVDA", tone: "ink" },
  engine: { at: [238, 262], w: 100, d: 76, title: "Price calculator" },
  proof: { at: [334, 126], w: 90, d: 84, title: "Proof you own it" },
  close: { at: [308, -108], w: 150, d: 110, title: "Closing price" },
};

/** Ground wires from a card to the stack. `step` is when it carries something; tone: what (money in, out, data). */
const WIRES = [
  { path: [[-186, 164], [-186, 120], [-60, 120], [-60, 82]], step: 0, tone: "good" },
  { path: [[-82, -30], [-262, -30]], step: 0, tone: "good" },
  { path: [[238, 224], [238, 60], [82, 60]], step: 1, tone: "ink" },
  { path: [[289, 126], [160, 126], [160, 20], [82, 20]], step: 1, tone: "ink" },
  { path: [[10, 272], [10, 82]], step: 1, tone: "accent" },
  { path: [[233, -60], [82, -60]], step: 2, tone: "ink" },
  { path: [[45, 82], [45, 272]], step: 3, tone: "good" },
  { path: [[-35, 82], [-35, 150], [-150, 150], [-150, 164]], step: 3, tone: "good" },
];

const LIT = [["vault", "pool"], ["cover", "kyc"], ["price", "cover"], ["pool", "cover"]];
const STORY = [
  ["You save $1,000", "$952 goes into US government bonds and grows back to $1,000. $48 goes into the pool to earn fees."],
  ["A stock owner buys protection", "We price it at $90, check they really own the shares, and they pay."],
  ["The closing price is recorded", "On the end date the stock exchange's closing price is saved. Nobody can change it."],
  ["Money goes out", "Crash: the pool pays the stock owner. No crash: the $90 stays and savers earn it."],
];

/** Flat drawings for each card's top face (no text: the title floats above the card). */
function CardArt({ kind }) {
  switch (kind) {
    case "saver":
      return (
        <>
          <circle cx="24" cy="26" r="11" className="iso-green-fill" />
          {[0, 1, 2].map((k) => (
            <rect key={k} x="48" y={18 + k * 9} width={46 - k * 12} height="4" rx="2" className="iso-ink-fill" opacity="0.7" />
          ))}
          {[0, 1, 2, 3].map((k) => (
            <ellipse key={k} cx="30" cy={66 - k * 4} rx="14" ry="5" className="iso-node" />
          ))}
        </>
      );
    case "holder":
      return (
        <>
          <circle cx="24" cy="26" r="11" className="iso-green-fill" />
          {[0, 1, 2].map((k) => (
            <rect key={k} x="48" y={18 + k * 9} width={46 - k * 12} height="4" rx="2" className="iso-ink-fill" opacity="0.7" />
          ))}
          {[14, 22, 18, 30, 26].map((h, k) => (
            <rect key={k} x={16 + k * 16} y={74 - h} width="10" height={h} rx="1.5" className={k === 4 ? "iso-green-fill" : "iso-ink-fill"} opacity={k === 4 ? 1 : 0.7} />
          ))}
        </>
      );
    case "engine":
      return (
        <>
          <polyline points="10,58 26,44 40,50 58,30 74,36 90,18" className="iso-chart is-good" />
          <circle cx="90" cy="18" r="4" className="iso-green-fill" />
        </>
      );
    case "proof":
      return (
        <>
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <rect x="10" y={14 + k * 22} width="12" height="12" rx="2" className="iso-line" />
              <rect x="30" y={18 + k * 22} width="48" height="4" rx="2" className="iso-ink-fill" opacity="0.6" />
            </g>
          ))}
          <path d="M12 20 L16 24 L22 16" className="iso-tick" />
          <path d="M12 42 L16 46 L22 38" className="iso-tick" />
        </>
      );
    case "close":
      return (
        <>
          <rect x="0" y="0" width="150" height="14" className="iso-ink-fill" />
          {[9, 17, 25].map((x) => (
            <circle key={x} cx={x} cy="7" r="2.2" fill="#fff" />
          ))}
          <line x1="12" x2="140" y1="58" y2="58" className="iso-guide" />
          <polyline points="12,36 34,40 52,34 74,52 96,62 118,82 140,90" className="iso-chart is-bad" />
          <circle cx="140" cy="90" r="4" className="iso-chart-dot is-bad" />
        </>
      );
    default:
      return null;
  }
}

export function SystemArt() {
  const [ref, phase, seek] = usePhase(18000, 0.1);
  const ids = useIds();
  const step = Math.min(3, Math.floor(phase * 4));
  const local = phase * 4 - step;
  const gap = 30 + 8 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 8));
  const zOf = (k) => k * (6 + gap);
  const PILLARS = [[-72, -72], [72, -72], [72, 72], [-72, 72]];
  const grid = [];
  for (let v = -440; v <= 440; v += 40) grid.push([[v, -440, 0], [v, 440, 0]], [[-440, v, 0], [440, v, 0]]);
  const LABEL_X = 196; // the plate labels form one column on the right

  return (
    <Stage className="grid gap-4">
      <div className="relative">
        {/* what is happening right now */}
        <div className="absolute right-0 top-0 z-10 max-w-[340px] rounded-xl border border-line bg-card/95 p-4 shadow-sm backdrop-blur" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white">{step + 1}</span>
            {STORY[step][0]}
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink2">{STORY[step][1]}</p>
        </div>

        <IsoSvg svgRef={ref} vb={[-500, -330, 1000, 640]} role="img" aria-label="The five parts of InsureVEX as a stack: ID check, price feed, government bonds, the pool and protection. Around it: savers, stock owners, government bonds, the price calculator, proof of ownership and the closing price.">
          <Defs ids={ids} />
          {grid.map(([a, b], i) => (
            <line key={i} x1={P(...a)[0]} y1={P(...a)[1]} x2={P(...b)[0]} y2={P(...b)[1]} className="iso-grid" />
          ))}

          {/* wires under everything */}
          {WIRES.map((w, i) => {
            const on = w.step === step;
            const s0 = P(...w.path[0], 0);
            const s1 = P(...w.path[w.path.length - 1], 0);
            return (
              <g key={i}>
                <polyline points={pts(...w.path.map(([x, y]) => [x, y, 0]))} className={`iso-wire ${on ? `is-${w.tone}` : "is-dim"}`} />
                <circle cx={s0[0]} cy={s0[1]} r="3" className="iso-node" />
                <circle cx={s1[0]} cy={s1[1]} r="3" className="iso-node" />
              </g>
            );
          })}

          {/* cards behind the stack */}
          {[0, 1, 2, 3].map((k) => (
            <Box key={k} x={CARDS.tbills.at[0] - 30} y={CARDS.tbills.at[1] - 30} z={k * 22} w={60} d={60} h={22} shadow={k === 0} className={k === 3 ? "iso-sage" : ""} />
          ))}
          <Card x={CARDS.close.at[0] - 75} y={CARDS.close.at[1] - 55} w={150} d={110}>
            <CardArt kind="close" />
          </Card>

          {/* the stack */}
          {PLATES.map((pl, k) => {
            const z = zOf(k);
            const lit = LIT[step].includes(pl.key);
            const top = {
              kyc: <>{[30, 62, 94].map((x) => <circle key={x} cx={x} cy="40" r="9" className="iso-node" />)}</>,
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
                    return <line key={`${x}${y}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="iso-pillar" />;
                  })}
              </g>
            );
          })}

          {/* cards in front of the stack */}
          {["saver", "holder", "engine", "proof"].map((k) => {
            const c = CARDS[k];
            return (
              <Card key={k} x={c.at[0] - c.w / 2} y={c.at[1] - c.d / 2} w={c.w} d={c.d}>
                <CardArt kind={k} />
              </Card>
            );
          })}

          {/* what is moving: coins are money, white blocks are information */}
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

          {/* plate labels: one tidy column on the right, a straight leader from each plate's right corner */}
          {PLATES.map((pl, k) => {
            const lit = LIT[step].includes(pl.key);
            const [cx, cy] = P(80, -80, zOf(k) + 3);
            const ly = cy;
            return (
              <g key={pl.key} className={`iso-plate-label ${lit ? "is-lit" : ""}`}>
                <line x1={cx + 4} y1={cy} x2={LABEL_X - 6} y2={ly} className="iso-leader" />
                <circle cx={cx} cy={cy} r="2.6" className="iso-pin" />
                <text x={LABEL_X} y={ly - 2} className="iso-plate-name">{pl.name}</text>
                <text x={LABEL_X} y={ly + 14} className="iso-plate-role">{pl.role}</text>
              </g>
            );
          })}

          {/* card titles, upright */}
          {Object.entries(CARDS).map(([k, c]) => {
            // pin the title to the card's top corner (its highest point on screen), clear of the drawing
            const w = c.w || 60;
            const d = c.d || 60;
            const [x, y] = P(c.at[0] - w / 2, c.at[1] - d / 2, k === "tbills" ? 88 : 3);
            const on = WIRES.some((wi, i) => wi.step === step && cardForWire(i) === k);
            return <Tag key={k} at={[x, y]} text={c.title} tone={on ? "ink" : ""} dx={k === "close" ? 90 : 0} dy={k === "close" ? -10 : -26} />;
          })}
        </IsoSvg>
      </div>
      <Steps items={STORY.map((s) => s[0])} active={step} starts={[0, 0.25, 0.5, 0.75]} onSeek={seek} />
    </Stage>
  );
}

/** Which card each wire belongs to (by index in WIRES). */
function cardForWire(i) {
  return ["saver", "tbills", "engine", "proof", "holder", "close", "holder", "saver"][i];
}

/* ───────────────────────── The pool: tranches and collateral ───────────────────────── */

export function PoolArt() {
  const [ref, phase, seek] = usePhase(12000);
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
  const cageC = (c) => [c.x + 32, c.y + 32, 40];
  const active = phase < 0.28 ? 0 : phase < 0.54 ? 1 : phase < 0.78 ? 2 : phase < 0.95 ? 3 : -1;

  const blockA = payA > 0 ? null : fly([0, 0, TOP], cageC(CAGES[0]), lockA, 60);
  // Unused collateral rises well clear of the tower before dropping back onto its top, then melts into it.
  const blockB = backB > 0 ? fly(cageC(CAGES[1]), [0, 0, TOP], backB, 150) : fly([0, 0, TOP], cageC(CAGES[1]), lockB, 60);
  const blockBo = 1 - span(phase, 0.88, 0.92);
  const blockAo = 1 - span(phase, 0.54, 0.58);
  const showB = lockB > 0 && backB < 1;

  return (
    <Stage className="grid gap-4">
      <IsoSvg svgRef={ref} vb={[-305,-262,580,395]} role="img" aria-label="The pool is a stack: backup money, savers' money, and Pro money on top. Fees come in, each payout is set aside, in a crash Pro pays first, and with no crash the money is freed up.">
        <Defs ids={ids} />
        <Floor id={ids.floor} />
        {[
          { path: [[-205, -95], [-120, -95], [-120, -20], [-50, -20]], tone: "accent", steps: [0] },
          { path: [[-205, 45], [-120, 45], [-120, 20], [-50, 20]], tone: "accent", steps: [0] },
          { path: [[50, -20], [80, -20], [80, -93], [105, -93]], tone: "good", steps: [1, 2] },
          { path: [[50, 20], [80, 20], [80, 47], [105, 47]], tone: "good", steps: [1, 3] },
        ].map((l, i) => (
          <Link key={i} path={l.path} tone={l.tone} on={l.steps.includes(active)} phase={phase} />
        ))}
        {HOLDERS.map(([x, y], i) => (
          <g key={i}>
            <Tray x={x - 30} y={y - 30} w={60} d={60} h={8} />
            <StockCerts x={x} y={y} z={8} w={36} d={28} sheets={6} ticker={i ? "INFY" : "NVDA"} />
          </g>
        ))}
        {HOLDERS.map(([x, y], i) => {
          const t = span(phase, 0.04 + i * 0.08, 0.2 + i * 0.08);
          return t > 0 && t < 1 ? <Coin key={i} at={fly([x, y, 22], [0, 0, TOP], smooth(t), 80)} tone="accent" /> : null;
        })}

        {/* The tower: reserve, senior sleeves, Pro first-loss */}
        <Box x={-50} y={-50} w={100} d={100} h={20} className="iso-sage" front={<text x="6" y="14" className="iso-text iso-bold">BACKUP</text>} />
        <Box x={-50} y={-50} z={20} w={100} d={100} h={60} shadow={false} front={<text x="6" y="20" className="iso-text iso-bold">SAVERS&apos; MONEY</text>} />
        <Box x={-50} y={-50} z={80} w={100} d={100} h={proH} shadow={false} className="iso-orange" front={proH > 16 ? <text x="6" y="14" className="iso-text iso-bold iso-on-dark">PRO</text> : null} />

        {CAGES.map((c, i) => (
          <g key={i}>
            <Safe x={c.x + 6} y={c.y + 6} />
            {i === 0 && blockA && lockA > 0 && <CoinRoll at={blockA} opacity={blockAo} />}
            {i === 1 && showB && backB === 0 && <CoinRoll at={blockB} />}
          </g>
        ))}
        {backB > 0 && backB < 1 && <CoinRoll at={blockB} opacity={blockBo} />}
        {payA > 0 && payA < 1 && <Coin at={fly(cageC(CAGES[0]), [HOLDERS[0][0], HOLDERS[0][1], 22], smooth(payA), 110)} tone="good" />}

        <Tag at={P(-20, -20, TOP)} text="fees in" dy={-36} tone="accent" opacity={span(phase, 0.08, 0.12) * (1 - span(phase, 0.28, 0.32))} />
        <Tag at={P(137, -93, 62)} text="payout set aside" dx={-20} dy={-40} tone="good" opacity={span(phase, 0.42, 0.46) * (1 - span(phase, 0.56, 0.6))} />
        <Tag at={P(-20, -20, TOP)} text="crash: Pro pays first" dx={60} dy={-44} tone="accent" opacity={span(phase, 0.62, 0.66) * (1 - span(phase, 0.8, 0.82))} />
        <Tag at={P(137, 47, 62)} text="no crash: money freed up" dx={70} dy={40} tone="good" opacity={span(phase, 0.82, 0.86) * (1 - out)} />
      </IsoSvg>
      <Steps items={["Fees in", "Payout set aside", "Crash: Pro pays first", "No crash: money freed up"]} active={active} starts={[0, 0.28, 0.54, 0.78]} onSeek={seek} />
    </Stage>
  );
}

/* ───────────────────────── Agent: autonomous, bounded payments on Hedera ───────────────────────── */

const AGENT_STAGES = ["preflight", "underwriting", "insurance", "audit", "complete"];
const AGENT_HOLD = [0.15, 0.4, 0.62, 0.8, 0.9];

/**
 * The agent's run as a toll road. The agent drives one lane and stops at four stations in order: the guardrail gate
 * (KYC, shares, budget, then the barrier lifts), the x402 toll booth (402 -> 0.01 HBAR -> signed quote), the cover
 * market (premium in, policy shield out) and the HCS ledger (audit record stamped). Then it drives off, protected.
 * Pass `stage` (one of AGENT_STAGES) to hold the scene on a live run's stage.
 */
export function AgentArt({ stage }) {
  const [ref, loop, seek] = usePhase(17000, 0.4);
  const ids = useIds();
  const held = AGENT_STAGES.indexOf(stage);
  const ph = held >= 0 ? AGENT_HOLD[held] : loop;
  const k = ph < 0.21 ? 0 : ph < 0.46 ? 1 : ph < 0.68 ? 2 : ph < 0.86 ? 3 : 4;

  const GX = -175; // gate
  const BX = -35; // toll booth
  const CX2 = 105; // cover market
  const LX = 235; // ledger
  const SY = -105; // stations sit behind the lane
  const stop = (x) => x - 34;

  // where the agent is along the lane
  const legs = [
    [0.0, 0.08, -280, GX - 96],
    [0.21, 0.28, GX - 96, stop(BX)],
    [0.46, 0.52, stop(BX), stop(CX2)],
    [0.68, 0.73, stop(CX2), stop(LX)],
    [0.86, 0.95, stop(LX), 300],
  ];
  let ax = -280;
  for (const [a, b, x0, x1] of legs) {
    if (ph >= a) ax = lerp(x0, x1, smooth(span(ph, a, b)));
  }
  const bob = ph % 0.25 < 0.2 && legs.some(([a, b]) => ph > a && ph < b) ? Math.sin(ph * 260) * 1.2 : 0;
  const fadeIn = clamp(span(ph, 0, 0.04)) * (1 - span(ph, 0.92, 0.96));
  const AZ = 34; // agent height

  // 1 · gate
  const checks = Math.floor(clamp(span(ph, 0.08, 0.17)) * 3.999);
  const lift = smooth(span(ph, 0.17, 0.21)) * (1 - smooth(span(ph, 0.93, 0.99)));
  const a = (lift * Math.PI) / 2.2;
  const post = [GX, -48, 38];
  const armEnd = [GX, post[1] + 96 * Math.cos(a), post[2] + 96 * Math.sin(a)];
  // 2 · toll
  const paid = ph > 0.38 && ph < 0.97;
  const coin = span(ph, 0.32, 0.38);
  const ticket = span(ph, 0.4, 0.45);
  // 3 · cover
  const prem = span(ph, 0.54, 0.59);
  const drop = span(ph, 0.6, 0.66);
  const shielded = ph >= 0.66;
  // 4 · ledger
  const packet = span(ph, 0.75, 0.8);
  const blocks = 3 + (ph >= 0.81 && ph < 0.97 ? 1 : 0);
  // budget left on the agent's meter
  const budget = 1 - (ph > 0.36 ? 0.18 : 0) - (ph > 0.58 ? 0.42 : 0) - (ph > 0.78 ? 0.06 : 0);

  const top = [ax, 0, AZ + bob];
  const [sx, sy] = P(ax, 0, AZ + 26 + bob);
  const shieldDrop = drop > 0 && drop < 1 ? P(lerp(CX2, ax, smooth(drop)), lerp(SY + 25, 0, smooth(drop)), lerp(72, AZ + 26, smooth(drop))) : null;

  return (
    <Stage className="grid gap-5">
      <IsoSvg svgRef={ref} vb={[-288, -262, 642, 430]} role="img" aria-label="The AI agent drives a toll road: a gate checks your ID, your shares and the budget; a toll booth charges 0.01 HBAR for a price; the protection stop takes the fee and protects the stock; a public record saves the payment. Then it drives off protected.">
        <Defs ids={ids} />
        <Floor id={ids.floor} />

        {/* stations behind the lane */}
        <Box x={GX - 26} y={SY - 26} w={52} d={52} h={8} className="iso-sage" top={<path d="M14 26 L22 34 L38 18" className="iso-tick" />} />

        <Tray x={BX - 40} y={SY - 30} w={80} d={60} h={10} />
        <Box x={BX - 30} y={SY - 22} z={10} w={60} d={44} h={66} shadow={false} front={
          <>
            <rect x="8" y="8" width="44" height="26" rx="3" className={paid ? "iso-screen-paid" : "iso-screen-due"} />
            <text x="30" y="26" textAnchor="middle" className="iso-screen-text">{paid ? "PAID" : "402"}</text>
            <rect x="20" y="44" width="20" height="4" rx="2" className="iso-ink-fill" />
          </>
        } />

        <Tray x={CX2 - 40} y={SY - 30} w={80} d={60} h={10} />
        <Box x={CX2 - 30} y={SY - 22} z={10} w={60} d={44} h={50} shadow={false} className="iso-black" front={
          <path d="M30 8 L44 13 V24 C44 32 38 37 30 40 C22 37 16 32 16 24 V13 Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        } />

        <Tray x={LX - 36} y={SY - 36} w={72} d={72} h={8} />
        {Array.from({ length: blocks }, (_, i) => (
          <Box key={i} x={LX - 24} y={SY - 24} z={8 + i * 15} w={48} d={48} h={12} shadow={false} className={i === 3 ? "iso-unit" : ""} />
        ))}

        {/* the lane */}
        <polygon points={pts([-290, -32, 0], [300, -32, 0], [300, 32, 0], [-290, 32, 0])} className="iso-road" />
        <polyline points={pts([-285, 0, 0], [295, 0, 0])} className="iso-road-mid" />
        {[GX, BX, CX2, LX].map((x) => (
          <polyline key={x} points={pts([stop(x) + 22, -30, 0], [stop(x) + 22, 30, 0])} className="iso-road-stop" />
        ))}

        {/* gate post */}
        <Box x={GX - 6} y={-56} w={12} d={12} h={40} />

        {/* the agent */}
        <g style={{ opacity: fadeIn }}>
          <Box x={ax - 22} y={-22} z={2 + bob} w={44} d={44} h={AZ - 2} className="iso-teal" front={
            <>
              <circle cx="14" cy="11" r="3.4" fill="#fff" />
              <circle cx="30" cy="11" r="3.4" fill="#fff" />
              <rect x="7" y="20" width="30" height="5" rx="2.5" fill="#fff" opacity="0.22" />
              <rect x="7" y="20" width={30 * budget} height="5" rx="2.5" className="iso-meter-fill" />
            </>
          } />
          {[-14, 14].map((dy) => (
            <Cyl key={dy} x={ax + 16} y={dy} r={6} h={4} shadow={false} className="iso-wheel" />
          ))}
          {shielded && <Shield x={sx} y={sy} s={1.25} />}
        </g>

        {/* what moves */}
        {coin > 0 && coin < 1 && <Coin at={fly(top, [BX, SY + 22, 58], smooth(coin), 50)} tone="accent" />}
        {ticket > 0 && ticket < 1 && <Box x={lerp(BX, ax, smooth(ticket)) - 10} y={lerp(SY + 22, 0, smooth(ticket)) - 7} z={lerp(46, AZ + 4, smooth(ticket)) + Math.sin(Math.PI * ticket) * 40} w={20} d={14} h={2} shadow={false} />}
        {prem > 0 && prem < 1 && <Coin at={fly(top, [CX2, SY + 26, 40], smooth(prem), 50)} tone="accent" />}
        {shieldDrop && <Shield x={shieldDrop[0]} y={shieldDrop[1]} s={1.25} />}
        {packet > 0 && packet < 1 && <Box x={lerp(ax, LX, smooth(packet)) - 6} y={lerp(0, SY, smooth(packet)) - 6} z={lerp(AZ, 8 + 3 * 15, smooth(packet)) + Math.sin(Math.PI * packet) * 60} w={12} d={12} h={8} shadow={false} className="iso-packet" />}
        <Ripple at={P(LX, SY, 8 + 4 * 15)} age={span(ph, 0.8, 0.88)} />

        {/* gate arm, in front of the agent */}
        <line x1={P(...post)[0]} y1={P(...post)[1]} x2={P(...armEnd)[0]} y2={P(...armEnd)[1]} className="iso-arm" />
        <line x1={P(...post)[0]} y1={P(...post)[1]} x2={P(...armEnd)[0]} y2={P(...armEnd)[1]} className="iso-arm-stripe" />

        {/* station names */}
        <Tag at={P(GX, SY, 8)} text="Safety checks" dy={-46} tone={k === 0 ? "ink" : ""} />
        <Tag at={P(BX, SY, 76)} text="Pay for price" dy={-30} tone={k === 1 ? "ink" : ""} />
        <Tag at={P(CX2, SY, 60)} text="Protection" dy={-30} tone={k === 2 ? "ink" : ""} />
        <Tag at={P(LX, SY, 8 + blocks * 15)} text="Public record" dy={-30} tone={k === 3 ? "ink" : ""} />

        {/* what is happening */}
        {k === 0 && ph > 0.06 && <Tag at={P(ax, 0, AZ + 6)} text={["checking…", "✓ ID", "✓ ID  ✓ shares", "✓ ID  ✓ shares  ✓ budget"][checks]} tone="good" dy={70} />}
        {k === 1 && ph > 0.29 && <Tag at={P(ax, 0, AZ + 6)} text={ph < 0.39 ? "pays 0.01 HBAR" : "price received"} tone={ph < 0.39 ? "accent" : "good"} dy={70} />}
        {k === 2 && ph > 0.53 && <Tag at={P(ax, 0, AZ + 6)} text={ph < 0.6 ? "pays the fee" : "protected · payout set aside"} tone={ph < 0.6 ? "accent" : "good"} dy={70} />}
        {k === 3 && ph > 0.74 && <Tag at={P(ax, 0, AZ + 6)} text="spending saved publicly" tone="good" dy={70} />}
        {k === 4 && <Tag at={P(ax, 0, AZ + 6)} text="protected · within budget" tone="good" dy={70} opacity={1 - span(ph, 0.92, 0.96)} />}
      </IsoSvg>
      <Steps items={["Safety checks", "Pay for a price", "Buy protection", "Save a record", "Protection active"]} active={k} starts={[0, 0.21, 0.46, 0.68, 0.86]} onSeek={held >= 0 ? undefined : seek} />
    </Stage>
  );
}
