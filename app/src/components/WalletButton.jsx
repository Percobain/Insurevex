"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { chainMeta } from "@/lib/chains";
import { useDemo, DEMO_ADDR } from "@/lib/demo";

const Caret = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="text-muted">
    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Header wallet control in the site's own style: one pill with the network on the left and the account on the right. */
function Pill({ chainName, address, onChain, onAccount, icon }) {
  return (
    <div className="flex h-10 items-stretch rounded-xl border border-line bg-card text-sm font-medium text-ink shadow-[0_1px_2px_rgb(26_36_35/0.04)]">
      <button type="button" onClick={onChain} title={`Network: ${chainName}. Click to switch.`}
        className="flex items-center gap-2 rounded-l-xl pl-3 pr-2.5 hover:bg-sunk transition">
        {icon || <span className="h-2 w-2 rounded-full bg-good" />}
        <span className="hidden md:inline">{chainName}</span>
        <Caret />
      </button>
      <span className="my-2 w-px bg-line" aria-hidden="true" />
      <button type="button" onClick={onAccount} title={address}
        className="flex items-center gap-2 rounded-r-xl pl-2.5 pr-3 hover:bg-sunk transition">
        <span className="h-5 w-5 rounded-full bg-[conic-gradient(from_200deg,var(--accent),var(--primary),var(--sage),var(--accent))]" aria-hidden="true" />
        <span className="font-mono text-[13px] tabular">{address}</span>
        <Caret />
      </button>
    </div>
  );
}

export default function WalletButton() {
  const demo = useDemo();
  if (demo) return <Pill chainName={chainMeta(Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 1874)).short} address={`${DEMO_ADDR.slice(0, 6)}…${DEMO_ADDR.slice(-4)}`} />;
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        if (!ready) return <div className="h-10 w-36 rounded-xl bg-sunk animate-pulse" aria-hidden="true" />;

        if (!account || !chain) {
          return <button type="button" onClick={openConnectModal} className="btn-primary h-10">Connect wallet</button>;
        }

        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className="btn h-10 border border-warn/50 bg-warn/10 text-ink hover:bg-warn/20">
              <span className="h-2 w-2 rounded-full bg-warn" /> Switch network <Caret />
            </button>
          );
        }

        const short = chainMeta(chain.id)?.short || chain.name;
        const icon = chain.hasIcon && chain.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chain.iconUrl} alt="" className="h-4 w-4 rounded-full" />
        ) : null;
        return <Pill chainName={short} address={account.displayName} onChain={openChainModal} onAccount={openAccountModal} icon={icon} />;
      }}
    </ConnectButton.Custom>
  );
}
