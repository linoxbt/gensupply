"use client";

import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import type { Address } from "genlayer-js/types";
import type { Signer, TxPhase } from "@/lib/gensupply";
import { connectedSigner } from "@/lib/walletProvider";
import { REOWN_PROJECT_ID } from "@/lib/wagmiConfig";

const PHASE: Record<TxPhase, string> = {
  signing: "Waiting for your wallet…",
  submitted: "Submitted — validators are running it…",
  accepted: "Accepted — waiting for finalization…",
  finalized: "Finalized",
};

type Props = {
  label: string;
  action: (signer: Signer, onPhase: (p: TxPhase) => void) => Promise<unknown>;
  onDone?: () => void;
  disabled?: boolean;
  hint?: ReactNode;
  variant?: "primary" | "ghost";
};

/**
 * Reports what actually happened, not what was sent. Nothing is called done
 * before FINALIZED: payouts are external messages that only execute then.
 */
function Inner({ label, action, onDone, disabled, hint, variant = "primary" }: Props) {
  const { isConnected } = useAccount();
  const [phase, setPhase] = useState<TxPhase>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    setError(undefined);
    setDone(false);
    setBusy(true);
    setPhase("signing");
    try {
      const signer = await connectedSigner();
      await action({ provider: signer.provider, account: signer.account as Address }, setPhase);
      setDone(true);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPhase(undefined);
    }
  }

  const style =
    variant === "primary"
      ? "bg-thermal-cool text-frost-950 hover:bg-ice"
      : "border border-frost-line bg-frost-850 text-ice hover:border-thermal-cool";

  return (
    <div>
      <button
        onClick={run}
        disabled={busy || disabled || !isConnected}
        className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${style}`}
      >
        {busy ? "Working…" : label}
      </button>
      {!isConnected ? <p className="mt-1.5 text-xs text-frost-mute">Connect a wallet to sign.</p> : null}
      {hint && !busy ? <p className="mt-1.5 text-xs text-frost-mute">{hint}</p> : null}
      {busy && phase ? (
        <p className="mt-2 text-xs text-ice/80">
          {PHASE[phase]}
          {phase === "accepted" ? <span className="block text-frost-mute">Transfers execute at finalization. Leave this open.</span> : null}
        </p>
      ) : null}
      {done ? <p className="mt-2 text-xs text-paid">Finalized on chain.</p> : null}
      {error ? <p className="mt-2 max-w-md break-words rounded-lg border border-thermal-hot/40 bg-thermal-hot/10 p-2 text-xs text-thermal-hot">{error}</p> : null}
    </div>
  );
}

export default function TxButton(props: Props) {
  if (!REOWN_PROJECT_ID) {
    return <p className="text-xs text-thermal-warm">Wallet connection is not configured on this deployment.</p>;
  }
  return <Inner {...props} />;
}
