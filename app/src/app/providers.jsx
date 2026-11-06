"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { useEffect, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, connectorsForWallets, lightTheme } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, coinbaseWallet, walletConnectWallet, rainbowWallet } from "@rainbow-me/rainbowkit/wallets";
import { CHAINS, DEFAULT_CHAIN_ID } from "@/lib/chains";
import { ToastProvider } from "@/components/Toasts";
import { ThemeProvider } from "@/components/Theme";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
const appUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://insurevex-app.vercel.app";

// Without a WalletConnect project id only injected (browser extension) wallets are offered.
const connectors = connectorsForWallets(
  [{ groupName: "Wallets", wallets: projectId ? [injectedWallet, metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet] : [injectedWallet] }],
  {
    appName: "InsureVEX",
    appUrl,
    appIcon: new URL("/brand/app-icon-512.png", appUrl).href,
    projectId: projectId || "insurevex-injected-only",
  },
);

const ordered = [...CHAINS].sort((a, b) => (a.id === DEFAULT_CHAIN_ID ? -1 : b.id === DEFAULT_CHAIN_ID ? 1 : 0));

const config = createConfig({
  chains: ordered,
  connectors,
  transports: Object.fromEntries(CHAINS.map((c) => [c.id, http(c.rpcUrls.default.http[0])])),
  ssr: true,
});

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

function RainbowThemed({ children }) {
  const accent = "#1f3d3c";
  const t = lightTheme({ accentColor: accent, borderRadius: "medium" });
  return (
    <RainbowKitProvider theme={t} initialChain={DEFAULT_CHAIN_ID} modalSize="compact">
      {children}
    </RainbowKitProvider>
  );
}

export default function Providers({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <ThemeProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowThemed>
            <ToastProvider>{mounted ? children : <div className="min-h-screen" />}</ToastProvider>
          </RainbowThemed>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
