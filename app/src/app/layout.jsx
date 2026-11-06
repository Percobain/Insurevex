import "./globals.css";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { PageDemoPopup } from "@/components/DemoVideo";

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Inter_Tight({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://insurevex-app.vercel.app"),
  applicationName: "InsureVEX",
  title: "InsureVEX: protect your stocks, save safely",
  description: "Get paid if your stock crashes. Or save with your money back guaranteed, plus extra from the fees.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "InsureVEX",
    title: "InsureVEX: protect your stocks, save safely",
    description: "Protect your stocks. Grow your savings safely.",
    images: [{ url: "/brand/social-card.png", width: 1200, height: 630, alt: "InsureVEX — protect your stocks, grow your savings safely" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "InsureVEX: protect your stocks, save safely",
    description: "Protect your stocks. Grow your savings safely.",
    images: ["/brand/social-card.png"],
  },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f4f0" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <PageDemoPopup />
        </Providers>
      </body>
    </html>
  );
}
