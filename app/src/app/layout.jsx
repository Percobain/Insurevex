import "./globals.css";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Inter_Tight({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "InsureVEX: protect your stocks, save safely",
  description: "Get paid if your stock crashes. Or save with your money back guaranteed, plus extra from the fees.",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
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
