import { Card, Eyebrow, PageTitle } from "@/components/ui";
import { CONTRACT_ADDRESS } from "@/lib/config";

const SECTIONS: { h: string; body: string[] }[] = [
  {
    h: "Why there is no Solidity, no NFT contract and no oracle adapter",
    body: [
      "A GenLayer Intelligent Contract holds native GEN, stores the policy records, reaches the web and runs an LLM - all under validator consensus. So GenSupply is one Python contract. The policy is a transferable on-chain record with an ERC-1155-shaped balance_of view; the escrow is the contract's own balance; the \"adjudicator\" is the consensus round itself.",
    ],
  },
  {
    h: "Device identity",
    body: [
      "GenVM has no signature-verification primitive, and none is needed. A policy binds a device address, and commit_batch only accepts that sender - the chain's transaction signature is the attestation. Transferring the policy moves who gets paid, never which device may speak for the cargo.",
    ],
  },
  {
    h: "Merkle commitments and the backdating guard",
    body: [
      "Each batch is a JSON document of integer readings (time, tenths of a degree, 1e-5 degree coordinates, device). Leaves are sha256(0x00 ‖ canonical JSON) and nodes sha256(0x01 ‖ left ‖ right); an odd node is promoted, never duplicated, so two different reading lists can never share a root.",
      "A batch must start after the cover did, must not overlap the previous one, cannot be timestamped in the future, and must be committed within the commit lag. Roots are fixed while nobody knows whether a claim will follow.",
    ],
  },
  {
    h: "Round 1 - verify_telemetry (deterministic)",
    body: [
      "Validators fetch the raw bytes of every batch through the configured IPFS gateway with strict equality - content-addressed bytes are identical for every honest node - then rebuild each root in-contract. A gateway cannot forge telemetry: whatever it serves must hash to the committed root. A mismatch, a malformed document, the wrong device or policy in the header, or a reading outside the committed window marks the claim TAMPERED and voids the policy.",
      "The breach is then computed: the longest run of readings strictly above the threshold, broken by any gap wider than the product allows. Time the logger did not record is never credited.",
    ],
  },
  {
    h: "Round 2 - adjudicate_claim (the only judgment)",
    body: [
      "Physically impossible GPS tracks are rejected in code before any model runs. Otherwise each validator independently pulls Open-Meteo ambient temperature for the route during the breach, reads deterministic features of the series and the product's written exclusions, and classifies the excursion GENUINE, SENSOR_FAULT or INCONSISTENT. Validators must match the leader's classification (and, when genuine, the exclusion decision). Reasoning text is never compared.",
      "Customs documents are optional, restricted to hosts the underwriter approved, snapshotted at attachment time inside consensus, and fenced in the prompt as untrusted data.",
    ],
  },
  {
    h: "Payout",
    body: [
      "severity = mean(duration ÷ full-payout duration, peak excess ÷ full-payout excess), each capped at 100%. The payout is the severity's decile rounded up - any qualifying breach pays at least 10%, a full one 100%. It is fixed in round 1, so the judged round can only allow or refuse it. The transfer is an external message and executes only at finalization.",
    ],
  },
  {
    h: "Solvency",
    body: [
      "Every policy reserves its maximum payout. A rejected claim leaves the policy live and its reservation in place; the reservation is released only when a policy is paid, voided or expires past its claim grace period. LP accounting is share-based.",
    ],
  },
];

export default function HowItWorks() {
  return (
    <>
      <PageTitle eyebrow="How it works" title="The design, in the order a claim experiences it." />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {SECTIONS.map((s) => (
            <Card key={s.h}>
              <h2 className="text-lg font-semibold text-ice">{s.h}</h2>
              {s.body.map((p) => (
                <p key={p.slice(0, 20)} className="mt-3 leading-relaxed text-frost-mute">{p}</p>
              ))}
            </Card>
          ))}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <Eyebrow>Run the device agent</Eyebrow>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-frost-950 p-3 font-mono text-xs leading-relaxed text-ice">{`git clone github.com/linoxbt/gensupply
cd gensupply
echo PINATA_JWT=... > agent/.env
GENSUPPLY_PW=... node agent/run.mjs \\
  --scenario breach   # nominal | fault | tamper`}</pre>
            <p className="mt-3 text-xs text-frost-mute">The agent buys cover, streams readings, pins and commits batches, files on breach, and drives both rounds to settlement.</p>
          </Card>
          <Card>
            <Eyebrow>Contract</Eyebrow>
            <p className="mt-2 break-all font-mono text-xs text-ice">{CONTRACT_ADDRESS || "not configured"}</p>
            <p className="mt-1 text-xs text-frost-mute">GenLayer Studio Network</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
