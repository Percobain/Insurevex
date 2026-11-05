import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line mt-20">
      <div className="mx-auto max-w-page px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <div className="font-semibold">Insure<span className="text-accent">VEX</span></div>
          <p className="text-ink2 mt-2 max-w-xs">
            Two scared people protect each other. Savers keep their money; holders keep their nerve.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-ink2">
          <Link href="/protect" className="hover:text-ink">Protect a stock</Link>
          <Link href="/save" className="hover:text-ink">Buy a protected note</Link>
          <Link href="/pool" className="hover:text-ink">Pool dashboard</Link>
          <Link href="/docs" className="hover:text-ink">Research and backtest</Link>
          <Link href="/activity" className="hover:text-ink">On-chain activity</Link>
          <Link href="/issuer" className="hover:text-ink">Issuer console</Link>
        </div>
        <p className="text-muted text-xs leading-relaxed">
          Testnet prototype. Test tokens have no value. Backtest results are simulations on historical data and are not a
          promise of future returns. Not an offer of insurance or securities.
        </p>
      </div>
    </footer>
  );
}
