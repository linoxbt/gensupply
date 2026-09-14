"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TelemetryChart } from "@/components/TelemetryChart";
import TxButton from "@/components/TxButton";
import { Badge, Card, ErrorNote, Eyebrow, Field, Loading, Mono, Stat, StateBadge, inputClass } from "@/components/ui";
import { BROWSER_GATEWAY } from "@/lib/config";
import { celsius, clock, duration, gen, pct, shortAddr, shortHash, when } from "@/lib/format";
import {
  adjudicateClaim, attachCustomsDoc, claimsForPolicy, fileClaim, getPolicy, getProduct, listBatches, releaseExpired, transferPolicy, verifyTelemetry,
} from "@/lib/gensupply";
import { checkAll, type BatchCheck } from "@/lib/telemetry";
import type { Claim, Policy, Product } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

const OUTCOME_COPY: Record<string, string> = {
  PAID: "Breach verified and judged genuine. Paid to the policy holder.",
  TAMPERED: "Pinned telemetry does not match the root the device committed. Policy voided.",
  NO_BREACH: "Readings verified, but the longest run above threshold was shorter than the product's minimum. Cover remains live.",
  SENSOR_FAULT: "Validators agreed the excursion looks like a probe fault, not a warming cargo space. Cover remains live.",
  INCONSISTENT: "The readings cannot be real for this route. Cover remains live.",
  EXCLUDED: "A written exclusion applies. Cover remains live.",
};

function CheckBadge({ c }: { c?: BatchCheck }) {
  if (!c) return <Badge>checking…</Badge>;
  if (c.status === "verified") return <Badge tone="paid">root matches</Badge>;
  if (c.status === "mismatch") return <Badge tone="hot">root mismatch</Badge>;
  if (c.status === "invalid") return <Badge tone="hot">not telemetry</Badge>;
  return <Badge tone="warm">gateway unreachable</Badge>;
}

function ClaimTimeline({ claim, product, reload }: { claim: Claim; product: Product; reload: () => void }) {
  const [url, setUrl] = useState("");
  const f = claim.features;
  const stages = [
    { label: "Filed", at: claim.filedAt, done: true },
    { label: "Telemetry verified", at: claim.verifiedAt, done: claim.state !== "FILED" && claim.outcome !== "TAMPERED" },
    { label: "Adjudicated", at: claim.closedAt, done: claim.state === "CLOSED" && !!claim.classification },
  ];

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-ice">Claim #{claim.id}</h3>
          <StateBadge state={claim.state} />
          <StateBadge state={claim.outcome} />
        </div>
        <p className="font-mono text-xs text-frost-mute">
          batches {claim.firstSeq}–{claim.lastSeq} · filed by {shortAddr(claim.filer)}
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {stages.map((s) => (
          <li key={s.label} className={`rounded-xl border p-3 ${s.done ? "border-thermal-cool/40" : "border-frost-line"}`}>
            <p className={`text-sm font-medium ${s.done ? "text-ice" : "text-frost-mute"}`}>{s.label}</p>
            <p className="font-mono text-xs text-frost-mute">{s.done && s.at ? when(s.at) : "pending"}</p>
          </li>
        ))}
      </ol>

      {claim.outcome ? <p className="text-sm text-ice">{OUTCOME_COPY[claim.outcome]}</p> : null}

      {claim.integrity ? (
        <div>
          <Eyebrow>Integrity, as validators computed it</Eyebrow>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <tbody>
                {claim.integrity.batches.map((b) => (
                  <tr key={b.seq} className="border-t border-frost-line/60">
                    <td className="py-2 pr-3 font-mono text-frost-mute">#{b.seq}</td>
                    <td className="py-2 pr-3 font-mono">committed {shortHash(b.committed_root, 10)}</td>
                    <td className="py-2 pr-3 font-mono">rebuilt {b.recomputed_root ? shortHash(b.recomputed_root, 10) : "—"}</td>
                    <td className="py-2">{b.ok ? <Badge tone="paid">match</Badge> : <Badge tone="hot">{b.why}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {f && claim.outcome !== "TAMPERED" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Breach" value={duration(claim.breachMinutes)} sub={`peak +${celsius(claim.peakExcessX10)}`} />
          <Stat label="Payout decile" value={claim.payoutBps ? pct(claim.payoutBps) : "—"} sub={`severity ${pct(claim.severityBps)}`} />
          <Stat label="Max step" value={`${celsius(f.max_step_x10_per_min)}/min`} sub={`flatline ${f.longest_flatline_readings} readings`} />
          <Stat label="GPS speed" value={`${f.max_speed_kmh} km/h`} sub={`largest gap ${Math.round(f.max_gap_seconds / 60)} min`} />
        </div>
      ) : null}

      {claim.classification ? (
        <div className="rounded-xl border border-frost-line bg-frost-950/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Consensus classification</Eyebrow>
            <StateBadge state={claim.classification} />
            {claim.excluded === "true" ? <Badge tone="warm">exclusion applies</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-frost-mute">{claim.reasoning}</p>
          {claim.outcome === "PAID" ? (
            <p className="mt-3 font-mono text-lg text-paid">{gen(claim.payoutAtto)} GEN paid</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-6 border-t border-frost-line pt-4">
        {claim.state === "FILED" ? (
          <>
            <TxButton label="Verify telemetry" action={(s, p) => verifyTelemetry(s, claim.id, p)} onDone={reload} hint="Permissionless. Validators fetch and re-hash every batch." />
            {product.customsHosts.length && !claim.customsUrl ? (
              <div className="min-w-[260px] flex-1 space-y-2">
                <Field label="Attach customs document (optional)" hint={`Admissible hosts: ${product.customsHosts.join(", ")}`}>
                  <input className={inputClass} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value.trim())} />
                </Field>
                <TxButton variant="ghost" label="Snapshot document" disabled={!url.startsWith("https://")} action={(s, p) => attachCustomsDoc(s, claim.id, url, p)} onDone={reload} />
              </div>
            ) : null}
          </>
        ) : null}
        {claim.state === "VERIFIED" ? (
          <TxButton label="Adjudicate & settle" action={(s, p) => adjudicateClaim(s, claim.id, p)} onDone={reload} hint="Permissionless. Pays at finalization if validators agree it is genuine." />
        ) : null}
      </div>
    </Card>
  );
}

export default function PolicyPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync(async () => {
    const policy: Policy = await getPolicy(id);
    const [product, batches, claims] = await Promise.all([getProduct(policy.productId), listBatches(id), claimsForPolicy(id)]);
    return { policy, product, batches, claims };
  }, [id]);

  const [checks, setChecks] = useState<BatchCheck[]>();
  useEffect(() => {
    if (!data?.batches.length) return;
    let live = true;
    void checkAll(data.batches).then((c) => live && setChecks(c));
    return () => {
      live = false;
    };
  }, [data?.batches]);

  const readings = useMemo(() => (checks ?? []).flatMap((c) => c.readings), [checks]);
  const latestBreach = data?.claims.at(-1)?.features?.breach;
  const [to, setTo] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;
  const { policy, product, batches, claims } = data;
  const openClaim = claims.some((c) => c.state !== "CLOSED");
  const now = Date.now() / 1000;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Link href="/policies" className="text-sm text-frost-mute hover:text-ice">← Shipments</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-semibold text-ice">{policy.shipmentRef}</h1>
            <StateBadge state={policy.state} />
          </div>
          <p className="text-frost-mute">
            Policy #{policy.id} · {policy.origin} → {policy.destination} · <Link className="hover:text-ice" href="/products">{product.name}</Link>
          </p>
        </div>
        <button onClick={reload} className="rounded-full border border-frost-line px-4 py-1.5 text-sm text-ice hover:border-thermal-cool">Refresh</button>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Threshold" value={celsius(product.thresholdX10)} sub={`> ${duration(product.minBreachMinutes)}`} />
          <Stat label="Max payout" value={`${gen(product.maxPayoutAtto)} GEN`} />
          <Stat label="Paid" value={BigInt(policy.payoutAtto) > 0n ? `${gen(policy.payoutAtto)} GEN` : "—"} />
          <Stat label="Batches" value={policy.batchCount} />
          <Stat label="Cover" value={clock(policy.startsAt)} sub={`until ${when(policy.expiresAt)}`} />
          <Stat label="Device" value={<Mono>{shortAddr(policy.device)}</Mono>} sub={`holder ${shortAddr(policy.holder)}`} />
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>Telemetry</Eyebrow>
            <p className="mt-1 text-sm text-frost-mute">Fetched from IPFS and re-hashed in this browser - not read from our server, because there isn&apos;t one.</p>
          </div>
          {checks ? (
            <Badge tone={checks.every((c) => c.status === "verified") ? "paid" : "hot"}>
              {checks.filter((c) => c.status === "verified").length}/{checks.length} batches verified locally
            </Badge>
          ) : null}
        </div>
        {batches.length === 0 ? (
          <p className="text-frost-mute">No telemetry committed yet. The device agent commits a batch every few minutes.</p>
        ) : !checks ? (
          <Loading label="Fetching batches from IPFS and rebuilding Merkle roots…" />
        ) : readings.length ? (
          <TelemetryChart readings={readings} thresholdX10={product.thresholdX10} breach={latestBreach} mismatched={checks.filter((c) => c.status !== "verified").map((c) => c.batch)} />
        ) : (
          <p className="text-thermal-warm">No batch could be read through {BROWSER_GATEWAY}.</p>
        )}

        {batches.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-frost-mute">
                <tr>{["#", "Window", "Readings", "CID", "Committed root", "Local check"].map((h) => <th key={h} className="pb-2 pr-3 font-medium uppercase tracking-widest">{h}</th>)}</tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.seq} className="border-t border-frost-line/60">
                    <td className="py-2 pr-3 font-mono">{b.seq}</td>
                    <td className="py-2 pr-3 font-mono text-frost-mute">{clock(b.tFrom)}–{clock(b.tTo)}</td>
                    <td className="py-2 pr-3 font-mono">{b.count}</td>
                    <td className="py-2 pr-3 font-mono">
                      <a className="text-thermal-cool hover:text-ice" href={BROWSER_GATEWAY + b.cid} target="_blank" rel="noreferrer">{shortHash(b.cid, 12)}</a>
                    </td>
                    <td className="py-2 pr-3 font-mono text-frost-mute">{shortHash(b.merkleRoot, 10)}</td>
                    <td className="py-2"><CheckBadge c={checks?.find((c) => c.batch.seq === b.seq)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {claims.slice().reverse().map((c) => (
        <ClaimTimeline key={c.id} claim={c} product={product} reload={reload} />
      ))}

      {policy.state === "ACTIVE" ? (
        <Card className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <Eyebrow>File a claim</Eyebrow>
            <p className="text-sm text-frost-mute">The device agent files automatically on breach. The holder can also file over committed batches.</p>
            <TxButton
              label={`Claim batches ${Math.max(1, policy.batchCount - 11)}–${policy.batchCount}`}
              disabled={policy.batchCount === 0 || openClaim}
              action={(s, p) => fileClaim(s, policy.id, Math.max(1, policy.batchCount - 11), policy.batchCount, p)}
              onDone={reload}
            />
          </div>
          <div className="space-y-2">
            <Eyebrow>Transfer cover</Eyebrow>
            <input className={inputClass} placeholder="New holder 0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
            <TxButton variant="ghost" label="Transfer policy" disabled={!/^0x[0-9a-fA-F]{40}$/.test(to)} action={(s, p) => transferPolicy(s, policy.id, to, p)} onDone={reload} />
          </div>
          <div className="space-y-2">
            <Eyebrow>Expiry</Eyebrow>
            <p className="text-sm text-frost-mute">After cover ends and the claim grace period passes, anyone can release the reserved capital.</p>
            <TxButton variant="ghost" label="Release reservation" disabled={now < policy.expiresAt} action={(s, p) => releaseExpired(s, policy.id, p)} onDone={reload} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
