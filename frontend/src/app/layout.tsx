import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import AppKitProvider from "@/components/AppKitProvider";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "GenSupply — cold-chain cover that pays itself",
  description:
    "Parametric cargo insurance settled from the sensor's own data. Devices commit Merkle roots on-chain, validators rebuild them from IPFS, and GenLayer consensus pays the breach.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <AppKitProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </AppKitProvider>
      </body>
    </html>
  );
}
