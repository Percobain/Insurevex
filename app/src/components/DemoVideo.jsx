"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export const DEMOS = {
  all: { src: "/videos/demo-all-types.mp4", poster: "/videos/demo-all-types.jpg", title: "InsureVEX in about a minute", length: "1 min" },
  saver: { src: "/videos/type1-saver.mp4", poster: "/videos/type1-saver.jpg", title: "Type 1: the Saver", length: "20 sec" },
  holder: { src: "/videos/type2-holder.mp4", poster: "/videos/type2-holder.jpg", title: "Type 2: the Holder", length: "27 sec" },
  pro: { src: "/videos/type3-pro.mp4", poster: "/videos/type3-pro.jpg", title: "Type 3: the Pro LP", length: "20 sec" },
};

function PlayIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" fill="currentColor" />
    </svg>
  );
}

function CloseIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Thumbnail with a play button. */
export function DemoThumb({ demo, className = "" }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-sunk ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={demo.poster} alt="" className="h-full w-full object-cover" loading="lazy" />
      <span className="absolute inset-0 grid place-items-center bg-black/10">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-primary shadow-md">
          <PlayIcon className="ml-0.5 h-4 w-4" />
        </span>
      </span>
    </div>
  );
}

/** Full-screen player. Esc or a click outside closes it. */
export function VideoModal({ demo, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={demo.title} onClick={onClose}>
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between text-white">
          <div className="text-sm font-medium">{demo.title}</div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close video">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <video ref={ref} src={demo.src} poster={demo.poster} controls autoPlay playsInline className="aspect-[16/10] w-full rounded-xl bg-black shadow-2xl" />
      </div>
    </div>
  );
}

/** Button that opens one demo in the player. */
export function DemoButton({ demo, label = "Watch the demo", className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`group flex items-center gap-3 rounded-xl border border-line bg-card p-2 pr-4 text-left transition-colors hover:border-ink2 ${className}`}>
        <DemoThumb demo={demo} className="h-14 w-[88px] shrink-0" />
        <span>
          <span className="block text-sm font-medium text-ink">{label}</span>
          <span className="block text-xs text-ink2">{demo.length} · {demo.title}</span>
        </span>
      </button>
      {open && <VideoModal demo={demo} onClose={() => setOpen(false)} />}
    </>
  );
}

// Which video each page's popup plays: the full tour on the home page, the matching investor type elsewhere.
const PAGE_DEMOS = {
  "/": { demo: DEMOS.all, title: "Watch the demo", line: (d) => `New here? It takes ${d.length}.` },
  "/save": { demo: DEMOS.saver, title: "Watch the Type 1 demo", line: (d) => `How saving works · ${d.length}` },
  "/protect": { demo: DEMOS.holder, title: "Watch the Type 2 demo", line: (d) => `How protection works · ${d.length}` },
  "/pool": { demo: DEMOS.pro, title: "Watch the Type 3 demo", line: (d) => `How earning works · ${d.length}` },
};

/** Picks the popup for the current page; remounts on navigation so it shows again on every page visit. */
export function PageDemoPopup() {
  const path = usePathname();
  const page = PAGE_DEMOS[path];
  if (!page) return null;
  return <DemoPopup key={path} {...page} />;
}

/** Small popup in the bottom-right corner shown every time someone opens a page that has a demo. */
export function DemoPopup({ demo = DEMOS.all, title = "Watch the demo", line = (d) => `New here? It takes ${d.length}.` }) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => setShow(false);

  return (
    <>
      {show && !open && (
        <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:w-[380px] animate-[demoIn_.35s_ease-out]">
          <div className="relative flex items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-xl">
            <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-label={`${title} video`}>
              <DemoThumb demo={demo} className="h-[72px] w-[116px] shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{title}</span>
                <span className="block text-sm text-ink2">{line(demo)}</span>
              </span>
            </button>
            <button onClick={dismiss} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-sunk hover:text-ink" aria-label="Dismiss">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {open && <VideoModal demo={demo} onClose={() => setOpen(false)} />}
    </>
  );
}
