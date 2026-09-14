import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, type AppKitNetwork } from "@reown/appkit/networks";
import { CHAIN, RPC_URL } from "./config";

export const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

/** AppKit's defineChain fills the CAIP fields it needs to match a custom chain to a wallet. */
export const studio = defineChain({
  id: CHAIN.id,
  caipNetworkId: `eip155:${CHAIN.id}`,
  chainNamespace: "eip155",
  name: CHAIN.name,
  nativeCurrency: CHAIN.nativeCurrency,
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [studio];

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId: REOWN_PROJECT_ID || "unset",
  networks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
