"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { ErrorNote, Loading, PageTitle, StateBadge } from "@/components/ui";
import { gen, shortAddr, when } from "@/lib/format";
import { listPolicies } from "@/lib/gensupply";
import { useAsync } from "@/lib/useAsync";
import { REOWN_PROJECT_ID } from "@/lib/wagmiConfig";

function useAddress(): string | undefined {
  // useAccount is safe without AppKit (it is wagmi's), but keep the guard symmetrical.
  const { address } = useAccount();
  return REOWN_PROJECT_ID ? address : undefined;
}

export default function PoliciesPage() {
  const { data, error, loading } = useAsync(() => listPolicies(0, 100));
  const address = useAddress();
  const [mine, setMine] = useState(false);
  const rows = (data ?? [])
    .filter((p) => !mine || (address && p.holder.toLowerCase() === address.toLowerCase()))
    .reverse();

  return (
    <>
      <PageTitle eyebrow="Shipments" title="Every insured container, and what its sensor has proven.">
        Open one to see its telemetry re-verified in your browser against the roots its device committed on-chain.
      </PageTitle>

      {address ? (
        <div className="mb-4 flex gap-2 text-sm">
          {[false, true].map((m) => (
            <button
              key={String(m)}
              onClick={() => setMine(m)}
              className={`rounded-full border px-4 py-1.5 ${mine === m ? "border-thermal-cool text-thermal-cool" : "border-frost-line text-frost-mute"}`}
            >
              {m ? "Mine" : "All"}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <Loading /> : null}
      <ErrorNote error={error} />
      {data && rows.length === 0 ? <p className="text-frost-mute">No shipments yet.</p> : null}

      <div className={rows.length ? "overflow-x-auto rounded-2xl border border-frost-line" : ""}>
        {rows.length ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-frost-900 text-xs uppercase tracking-widest text-frost-mute">
              <tr>
                {["Policy", "Shipment", "Route", "Batches", "State", "Payout", "Holder", "Cover ends"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-frost-line/70 hover:bg-frost-900/60">
                  <td className="px-4 py-3">
                    <Link href={`/policy/${p.id}`} className="font-mono text-thermal-cool hover:text-ice">#{p.id}</Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-ice">{p.shipmentRef}</td>
                  <td className="px-4 py-3 text-frost-mute">{p.origin} → {p.destination}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{p.batchCount}</td>
                  <td className="px-4 py-3"><StateBadge state={p.state} /></td>
                  <td className="px-4 py-3 font-mono tabular-nums">{BigInt(p.payoutAtto) > 0n ? `${gen(p.payoutAtto)} GEN` : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-frost-mute">{shortAddr(p.holder)}</td>
                  <td className="px-4 py-3 text-frost-mute">{when(p.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </>
  );
}
