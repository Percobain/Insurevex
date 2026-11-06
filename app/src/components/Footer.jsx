import Link from "next/link";
import BrandLogo from "./BrandLogo";

export default function Footer() {
  return (
    <footer className="border-t border-line mt-20">
      <div className="mx-auto max-w-page px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <Link href="/" aria-label="InsureVEX home" className="inline-block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <BrandLogo className="w-[180px]" />
          </Link>
          <p className="text-ink2 mt-2 max-w-xs">Protect your stocks. Grow your savings safely.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-ink2">
          <Link href="/protect" className="hover:text-ink">Protect a stock</Link>
          <Link href="/save" className="hover:text-ink">Start saving</Link>
          <Link href="/pool" className="hover:text-ink">Earn</Link>
          <Link href="/metrics" className="hover:text-ink">Proof</Link>
          <Link href="/docs" className="hover:text-ink">Research</Link>
          <Link href="/activity" className="hover:text-ink">Activity</Link>
        </div>
        <p className="text-muted text-xs leading-relaxed">
          This is a test version that uses test money with no real value. Past results are not a promise of future
          returns. This is not an offer of insurance or investments.
        </p>
      </div>
    </footer>
  );
}
