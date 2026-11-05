import "./globals.css";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "InsureVEX",
  description: "Principal-protected notes that insure stock holders against crashes. Settled on-chain in stablecoins.",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
