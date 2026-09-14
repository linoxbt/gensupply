"use client";

import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { REOWN_PROJECT_ID, networks, wagmiAdapter } from "@/lib/wagmiConfig";

// AppKit's hooks throw if createAppKit never ran, so components that use them
// check REOWN_PROJECT_ID first rather than white-screening the app.
if (REOWN_PROJECT_ID) {
  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    defaultNetwork: networks[0],
    projectId: REOWN_PROJECT_ID,
    metadata: {
      name: "GenSupply",
      description: "Cold-chain cover that settles itself from verified sensor data on GenLayer.",
      url: "https://gensupply.netlify.app",
      icons: ["https://gensupply.netlify.app/icon.svg"],
    },
    features: { analytics: false, email: false, socials: [] },
  });
}

export default function AppKitProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
