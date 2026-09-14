import { chains } from "genlayer-js";
import type { Address } from "genlayer-js/types";

/**
 * One chain, one contract, fixed at build time.
 *
 * Next only inlines `process.env.NEXT_PUBLIC_*` on a literal member access; a
 * dynamic lookup silently resolves to undefined in the browser. Keep each
 * reference literal.
 */
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_GENSUPPLY_ADDRESS || "") as Address | "";

export const RPC_URL = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || chains.studionet.rpcUrls.default.http[0];

export const CHAIN = chains.studionet;

/** The browser re-verifies telemetry through this gateway; validators use the contract's own. */
export const BROWSER_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";

export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export function requireAddress(): Address {
  if (!CONTRACT_ADDRESS) throw new Error("No GenSupply contract configured. Set NEXT_PUBLIC_GENSUPPLY_ADDRESS.");
  return CONTRACT_ADDRESS as Address;
}
