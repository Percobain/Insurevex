"use client";

import { useState } from "react";
import logos from "../../public/logos/stocks/manifest.json";

/** Local company artwork with a ticker fallback for indices and unknown stocks. */
export default function StockLogo({ symbol, className = "h-8 w-8", selected = false }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const logo = logos[symbol?.symbol];
  const ticker = symbol?.ticker || symbol?.symbol?.split(":").pop() || "";
  const showImage = logo && failedSrc !== logo.src;

  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg ${showImage ? "bg-white ring-1 ring-inset ring-black/5" : selected ? "bg-primary text-white" : "bg-sunk text-ink2"} ${className}`}>
      {showImage ? (
        <img
          src={logo.src}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain p-1"
          onError={() => setFailedSrc(logo.src)}
        />
      ) : (
        <span className="text-[10px] font-bold">{ticker.slice(0, 4)}</span>
      )}
    </span>
  );
}
