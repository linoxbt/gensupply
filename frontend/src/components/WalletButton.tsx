"use client";

import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect } from "wagmi";
import { shortAddr } from "@/lib/format";
import { REOWN_PROJECT_ID } from "@/lib/wagmiConfig";

function Connected() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        title="Disconnect"
        className="rounded-full border border-frost-line bg-frost-850 px-3.5 py-1.5 font-mono text-xs text-ice hover:border-thermal-cool"
      >
        {shortAddr(address)}
      </button>
    );
  }
  return (
    <button onClick={() => open()} className="rounded-full bg-ice px-4 py-1.5 text-xs font-semibold text-frost-950 hover:bg-thermal-cool">
      Connect wallet
    </button>
  );
}

export default function WalletButton() {
  if (!REOWN_PROJECT_ID) {
    return <span className="text-xs text-thermal-warm" title="NEXT_PUBLIC_REOWN_PROJECT_ID is unset">wallet unavailable</span>;
  }
  return <Connected />;
}
