"use client";
import { createContext, useCallback, useContext, useState } from "react";

const ToastCtx = createContext({ push: () => 0, update: () => {}, dismiss: () => {} });

export function useToasts() {
  return useContext(ToastCtx);
}

let nextId = 1;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const update = useCallback(
    (id, patch) => {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      if (patch.state === "success" || patch.state === "error") setTimeout(() => dismiss(id), patch.state === "error" ? 12000 : 8000);
    },
    [dismiss],
  );

  const push = useCallback((t) => {
    const id = nextId++;
    setItems((xs) => [...xs.slice(-3), { id, state: "pending", ...t }]);
    if (t.state === "success" || t.state === "error" || t.state === "info") setTimeout(() => dismiss(id), 8000);
    return id;
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:w-[380px]" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="rounded-xl border border-line bg-card shadow-lg px-4 py-3 text-sm flex gap-3 items-start">
            <span
              className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                t.state === "success" ? "bg-good" : t.state === "error" ? "bg-bad" : t.state === "info" ? "bg-accent" : "bg-warn animate-pulse"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{t.title}</div>
              {t.body && <div className="text-ink2 break-words mt-0.5">{t.body}</div>}
              {t.href && (
                <a href={t.href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 mt-1 inline-block">
                  View on explorer
                </a>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
