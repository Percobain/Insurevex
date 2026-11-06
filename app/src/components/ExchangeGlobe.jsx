"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import { EXCHANGES } from "@/lib/exchanges";
import Flag from "./Flag";

/**
 * The 23 exchanges: a half globe on one side and a looping list of countries on the other. The row in the middle of
 * the list is the selected exchange; the globe turns to it and draws a line out to its label. The list steps on by
 * itself while on screen; scroll, drag, arrow keys or a click move it by hand.
 */

const W = 720;
const H = 560;
const CX = W / 2;
const R = 300;
const HZ = 520; // horizon: everything below is cut away
const CY = HZ - R * 0.5;
const TILT = 8; // look from 8°S so the southern exchanges clear the horizon
const TOUR_MS = 2600;
const N = EXCHANGES.length;
const ROW = 68; // list row pitch, px
const mod = (a, n) => ((a % n) + n) % n;

const LAND = feature(land110, land110.objects.land);
const GRATICULE = geoGraticule10();

/** Short exchange code for chips and the globe label. */
const TAG = { US: "NYSE", Canada: "TSX", Brazil: "B3", Mexico: "BMV", UK: "LSE", Germany: "XETRA", France: "EPA", Netherlands: "AMS", Switzerland: "SIX", Spain: "BME", Italy: "MIL", Sweden: "STO", Japan: "TSE", HongKong: "HKEX", ChinaA: "SSE", Taiwan: "TWSE", Korea: "KRX", India: "NSE", Singapore: "SGX", Australia: "ASX", Indonesia: "IDX", SouthAfrica: "JSE", Saudi: "TADAWUL" };
const tag = (e) => TAG[e.id] || e.exchange;
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180; // shortest signed difference in degrees

export default function ExchangeGlobe() {
  const [active, setActive] = useState(() => EXCHANGES.findIndex((e) => e.id === "India"));
  const [view, setView] = useState(() => ({ lambda: -EXCHANGES.find((e) => e.id === "India").lng, tilt: TILT }));
  const ref = useRef(null);
  const target = useRef(view);
  const holdUntil = useRef(0);
  const drag = useRef(null);

  // Ease the globe towards the active exchange.
  useEffect(() => {
    const e = EXCHANGES[active];
    target.current = { lambda: -e.lng, tilt: Math.min(TILT, Math.max(-12, -e.lat * 0.35 + TILT)) };
  }, [active]);
  useEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (drag.current) return;
      setView((v) => {
        const t = target.current;
        const dl = wrap(t.lambda - v.lambda);
        const dt = t.tilt - v.tilt;
        if (Math.abs(dl) < 0.05 && Math.abs(dt) < 0.05) return v;
        const k = calm ? 1 : 0.08;
        return { lambda: v.lambda + dl * k, tilt: v.tilt + dt * k };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The wheel: `wheel` is the drum position in rows (float), eased towards `goal`. The middle row is the active one.
  const start = EXCHANGES.findIndex((e) => e.id === "India");
  const goal = useRef(start);
  const [wheel, setWheel] = useState(start);
  useEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setWheel((w) => {
        const d = goal.current - w;
        if (Math.abs(d) < 0.001) return goal.current;
        return w + d * (calm ? 1 : 0.12);
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const a = mod(Math.round(wheel), N);
    setActive((cur) => (cur === a ? cur : a));
  }, [wheel]);

  // Step on by one while on screen, unless someone just turned it.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    const id = setInterval(() => {
      if (visible && !drag.current && !spin.current && Date.now() > holdUntil.current) goal.current = Math.round(goal.current) + 1;
    }, TOUR_MS);
    return () => {
      clearInterval(id);
      io.disconnect();
    };
  }, []);

  const hold = () => (holdUntil.current = Date.now() + 9000);
  /** Bring exchange i to the middle by the shortest way round. */
  const pick = (i) => {
    hold();
    const g = Math.round(goal.current);
    goal.current = g + ((((i - mod(g, N)) % N) + N + N / 2) % N) - N / 2;
    goal.current = Math.round(goal.current);
  };

  // Turning the wheel by hand: scroll, drag, keys.
  const spin = useRef(null);
  const acc = useRef(0);
  const onWheel = (ev) => {
    ev.preventDefault();
    hold();
    acc.current += ev.deltaY;
    if (Math.abs(acc.current) >= 40) {
      goal.current = Math.round(goal.current) + Math.sign(acc.current);
      acc.current = 0;
    }
  };
  const wheelRef = useRef(null);
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  const onSpinDown = (ev) => {
    spin.current = { y: ev.clientY, g: goal.current, moved: false };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const onSpinMove = (ev) => {
    if (!spin.current) return;
    const dy = ev.clientY - spin.current.y;
    if (Math.abs(dy) > 4) spin.current.moved = true;
    goal.current = spin.current.g - dy / ROW;
    setWheel(goal.current);
  };
  const onSpinUp = () => {
    if (!spin.current) return;
    goal.current = Math.round(goal.current);
    spin.current = null;
    hold();
  };
  const onKey = (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      hold();
      goal.current = Math.round(goal.current) + (ev.key === "ArrowDown" ? 1 : -1);
    }
  };

  const projection = useMemo(() => geoOrthographic().scale(R).translate([CX, CY]).rotate([view.lambda, view.tilt]).clipAngle(90), [view]);
  const path = geoPath(projection);
  const centre = [-view.lambda, -view.tilt];
  const dots = EXCHANGES.map((e, i) => {
    if (geoDistance([e.lng, e.lat], centre) > Math.PI / 2 - 0.05) return null;
    const [x, y] = projection([e.lng, e.lat]);
    return y > HZ - 4 ? null : { e, i, x, y };
  }).filter(Boolean);
  const cur = dots.find((d) => d.i === active);

  // The active exchange's label: out past the rim, then a short run sideways.
  let label = null;
  if (cur) {
    const ang = Math.atan2(cur.y - CY, cur.x - CX);
    const a = Math.min(-0.25, Math.max(-Math.PI + 0.25, ang > Math.PI / 2 ? ang - 2 * Math.PI : ang));
    const rx = CX + Math.cos(a) * (R + 26);
    const ry = CY + Math.sin(a) * (R + 26);
    const right = Math.cos(a) >= 0;
    const text = `${tag(cur.e)} · ${cur.e.city}`;
    const w = text.length * 8.6 + 56;
    const bx = right ? Math.min(W - w - 6, rx + 10) : Math.max(6, rx - 10 - w);
    label = { rx, ry, bx, by: Math.max(6, ry - 18), w, text, right };
  }

  const onDown = (ev) => {
    drag.current = { x: ev.clientX, l: view.lambda };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev) => {
    if (!drag.current) return;
    const scale = W / ev.currentTarget.getBoundingClientRect().width;
    const lambda = drag.current.l + ((ev.clientX - drag.current.x) * scale) / 5;
    target.current = { ...target.current, lambda };
    setView((v) => ({ ...v, lambda }));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    holdUntil.current = Date.now() + 9000;
  };

  return (
    <div ref={ref} className="grid lg:grid-cols-[0.95fr_1.05fr] gap-8 lg:gap-14 items-center">
      {/* Globe */}
      <div className="mx-auto w-full max-w-[560px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-pan-y cursor-grab active:cursor-grabbing select-none" role="img" aria-label={`Half globe with the ${EXCHANGES.length} exchanges InsureVEX covers. Showing ${EXCHANGES[active].exchange}, ${EXCHANGES[active].country}.`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <defs>
            <clipPath id="xg-above">
              <rect x="0" y="0" width={W} height={HZ} />
            </clipPath>
            <radialGradient id="xg-shade" cx="40%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="var(--sunk)" />
            </radialGradient>
            <pattern id="xg-sea" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="0.8" fill="var(--primary)" opacity="0.13" />
            </pattern>
          </defs>
          <g clipPath="url(#xg-above)">
            <path d={path({ type: "Sphere" })} fill="url(#xg-shade)" />
            <path d={path({ type: "Sphere" })} fill="url(#xg-sea)" />
            <path d={path(GRATICULE)} fill="none" stroke="var(--primary)" strokeWidth="0.6" opacity="0.14" />
            <path d={path(LAND)} fill="var(--sage)" stroke="var(--primary)" strokeWidth="1" strokeLinejoin="round" />
            <path d={path({ type: "Sphere" })} fill="none" stroke="var(--primary)" strokeWidth="1.6" />
          </g>
          <line x1="10" x2={W - 10} y1={HZ} y2={HZ} stroke="var(--primary)" strokeWidth="1.6" />
          <line x1="10" x2={W - 10} y1={HZ + 9} y2={HZ + 9} stroke="var(--line)" strokeDasharray="4 5" />

          {dots.map(({ e, i, x, y }) => (
            <g key={e.id} onClick={() => pick(i)} className="cursor-pointer">
              {i === active && <circle cx={x} cy={y} r="16" fill="var(--accent)" opacity="0.16" className="xg-pulse" />}
              <circle cx={x} cy={y} r={i === active ? 6.5 : 4.5} fill={i === active ? "var(--accent)" : "var(--primary)"} stroke="#fff" strokeWidth="2" />
            </g>
          ))}

          {cur && label && (
            <g pointerEvents="none">
              <polyline points={`${cur.x},${cur.y} ${label.rx},${label.ry} ${label.right ? label.bx : label.bx + label.w},${label.ry}`} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
              <g transform={`translate(${label.bx} ${label.by})`}>
                <rect width={label.w} height="36" rx="18" fill="var(--primary)" />
                <Flag code={cur.e.code} x="13" y="10" width="24" height="16" />
                <rect x="13" y="10" width="24" height="16" rx="2" fill="none" stroke="#fff" strokeOpacity="0.35" />
                <text x="42" y="24" fontSize="15" fontWeight="600" fill="#fff" style={{ fontFamily: "var(--font-sans)" }}>
                  {label.text}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* The wheel */}
      <div className="relative">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">{EXCHANGES[active].region}</span>
          <span className="text-xs text-muted tabular">
            {String(active + 1).padStart(2, "0")} / {N}
          </span>
        </div>
        <div
          ref={wheelRef}
          tabIndex={0}
          role="listbox"
          aria-label="Exchanges InsureVEX covers"
          aria-activedescendant={`xw-${EXCHANGES[active].id}`}
          onKeyDown={onKey}
          onPointerDown={onSpinDown}
          onPointerMove={onSpinMove}
          onPointerUp={onSpinUp}
          onPointerCancel={onSpinUp}
          className="relative h-[460px] overflow-hidden rounded-2xl border border-line bg-sunk/60 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          {/* the window the middle row sits in */}
          <div className="absolute inset-0">
            {EXCHANGES.map((e, i) => {
              const d = mod(i - wheel + N / 2, N) - N / 2; // rows from the middle, -N/2..N/2
              if (Math.abs(d) > 4.2) return null;
              const mid = Math.abs(d) < 0.5;
              const fade = Math.max(0, 1 - Math.max(0, Math.abs(d) - 0.5) * 0.24);
              return (
                <div
                  key={e.id}
                  id={`xw-${e.id}`}
                  role="option"
                  aria-selected={mid}
                  onClick={() => !spin.current?.moved && pick(i)}
                  className="absolute inset-x-3 top-1/2 -mt-[30px] h-[60px] cursor-pointer"
                  style={{ transform: `translateY(${d * ROW}px)`, opacity: fade }}
                >
                  <div className={`h-full flex items-center gap-3 rounded-xl px-3 transition-colors duration-200 ${mid ? "bg-primary text-white shadow-md" : "bg-card border border-line text-ink"}`}>
                    <Flag code={e.code} className={`h-6 w-9 shrink-0 rounded-[4px] ring-1 ${mid ? "ring-white/30" : "ring-black/10"} shadow-sm`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold leading-tight truncate">{e.country}</span>
                      <span className={`block text-xs leading-tight truncate ${mid ? "text-white/70" : "text-muted"}`}>
                        {e.exchange} · {e.city}
                      </span>
                    </span>
                    <span className={`ml-auto shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide ${mid ? "bg-accent text-white" : "bg-sunk text-ink2"}`}>{tag(e)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* soft edges */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-paper to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-paper to-transparent pointer-events-none" />
        </div>
        <div className="mt-3 px-1 text-xs text-muted">Scroll, drag or use ↑ ↓ to move</div>
      </div>
    </div>
  );
}
