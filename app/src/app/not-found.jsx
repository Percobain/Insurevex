import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

export const metadata = { title: "Page not found · InsureVEX" };

export default function NotFound() {
  return (
    <section className="mx-auto max-w-page px-4 py-24 sm:py-32 grid place-items-center text-center">
      <BrandLogo variant="icon" className="w-16" alt="" />
      <p className="eyebrow mt-8">Page not found</p>
      <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-3">This page does not exist.</h1>
      <p className="text-ink2 mt-3 max-w-md">The link may be old or mistyped. Everything else still works.</p>
      <div className="flex flex-wrap justify-center gap-3 mt-8">
        <Link href="/" className="btn-primary h-11 px-5">Go to the home page</Link>
        <Link href="/protect" className="btn-ghost h-11 px-5">Protect a stock</Link>
        <Link href="/save" className="btn-ghost h-11 px-5">Start saving</Link>
      </div>
    </section>
  );
}
