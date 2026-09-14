import Link from "next/link";
import { LiveStats } from "@/components/LiveStats";
import { Eyebrow } from "@/components/ui";

const STEPS = [
  {
    n: "01",
    title: "The device signs",
    body: "The policy binds a device key. Only that key can commit telemetry, so the chain's own transaction signature is the sensor's attestation.",
    tag: "commit_batch",
  },
  {
    n: "02",
    title: "Data is locked before anyone knows",
    body: "Every few minutes the agent pins a batch to IPFS and commits its CID and Merkle root. Batches older than the commit lag are refused - readings cannot be rewritten after a breach is known.",
    tag: "IPFS + Merkle root",
  },
  {
    n: "03",
    title: "Validators rebuild the proof",
    body: "On a claim, every validator fetches the raw bytes behind each CID and rebuilds the tree inside the contract. One mismatched root voids the policy. The breach duration is computed in code, not judged.",
    tag: "verify_telemetry · strict_eq",
  },
  {
    n: "04",
    title: "One narrow judgment",
    body: "Is the excursion physically credible? Validators pull real ambient weather for the route, weigh rate-of-change, flatlines and GPS speed, apply the written exclusions, and must agree on the classification.",
    tag: "adjudicate_claim · run_nondet",
  },
  {
    n: "05",
    title: "The payout computes itself",
    body: "Duration and depth against the product's full-payout points, quantised to deciles. No validator proposes an amount, so none can inflate it. The transfer executes at finalization.",
    tag: "deterministic payout",
  },
];

function HeroTrace() {
  // A reefer holding 3°C, failing, and warming past the 8°C line.
  const hold = "M0 180 L60 178 L120 181 L180 179 L240 180 L300 178";
  const fail = "M300 178 C360 170 400 120 450 92 S560 60 640 52 L760 48";
  return (
    <svg viewBox="0 0 760 240" className="h-auto w-full" role="img" aria-label="A temperature trace holding steady, then rising past the threshold after a refrigeration failure">
      <defs>
        <linearGradient id="warm" x1="300" x2="760" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5cc8e4" />
          <stop offset="0.35" stopColor="#f0b65a" />
          <stop offset="1" stopColor="#ff6a55" />
        </linearGradient>
        <linearGradient id="band" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff6a55" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ff6a55" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="760" height="130" fill="url(#band)" />
      <line x1="0" x2="760" y1="130" y2="130" stroke="#e6f2f6" strokeOpacity="0.35" strokeDasharray="4 6" />
      <text x="0" y="122" fill="#7a98a6" fontSize="12" fontFamily="var(--font-mono)">threshold 8.0°C</text>
      <path d={hold} fill="none" stroke="#5cc8e4" strokeWidth="2.5" strokeLinecap="round" className="animate-draw" style={{ ["--len" as string]: 320 }} />
      <path d={fail} fill="none" stroke="url(#warm)" strokeWidth="2.5" strokeLinecap="round" className="animate-draw" style={{ ["--len" as string]: 520, animationDelay: "1.4s" }} />
      <circle cx="760" cy="48" r="5" fill="#ff6a55" className="animate-pulse-dot" />
      <text x="470" y="30" fill="#ff6a55" fontSize="12" fontFamily="var(--font-mono)">breach → claim filed by the device</text>
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,#0f2a38_0%,#050e14_60%)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-32 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-40">
          <div className="space-y-6">
            <Eyebrow>Parametric cargo insurance on GenLayer</Eyebrow>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-ice sm:text-6xl">
              Cold-chain cover that <span className="text-thermal-hot">pays itself.</span>
            </h1>
            <p className="max-w-xl text-lg text-frost-mute">
              The sensor commits its own proof. Validators rebuild it from IPFS, check it against the real weather on
              the route, and settle the claim in consensus. No adjuster, no oracle operator, no resolver key.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/products" className="rounded-full bg-thermal-cool px-6 py-2.5 text-sm font-semibold text-frost-950 hover:bg-ice">
                Insure a shipment
              </Link>
              <Link href="/policies" className="rounded-full border border-frost-line px-6 py-2.5 text-sm font-semibold text-ice hover:border-ice">
                Watch live shipments
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-frost-line bg-frost-900/60 p-5 sm:p-7">
            <div className="mb-3 flex items-center justify-between font-mono text-xs text-frost-mute">
              <span>REEFER · MSKU 481 220-7</span>
              <span className="flex items-center gap-2 text-thermal-hot">
                <span className="size-1.5 rounded-full bg-thermal-hot" /> live excursion
              </span>
            </div>
            <HeroTrace />
          </div>
        </div>
      </section>

      <section className="border-y border-frost-line/60 bg-frost-900/50">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
          <LiveStats />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mb-12 max-w-2xl space-y-3">
          <Eyebrow>The proof chain</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight text-ice sm:text-4xl">From a probe reading to a payout, with nobody deciding.</h2>
          <p className="text-frost-mute">
            Most of the claim is not a judgment call at all - it is arithmetic and hashing that every validator reproduces
            exactly. The model is asked one narrow question, and never asked for a number.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col rounded-2xl border border-frost-line bg-frost-900/70 p-6">
              <span className="font-mono text-sm text-thermal-cool">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold text-ice">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-frost-mute">{s.body}</p>
              <span className="mt-4 self-start rounded-full border border-frost-line px-2.5 py-0.5 font-mono text-[11px] text-frost-mute">{s.tag}</span>
            </li>
          ))}
          <li className="flex flex-col justify-between rounded-2xl border border-thermal-hot/30 bg-thermal-hot/5 p-6">
            <div>
              <span className="font-mono text-sm text-thermal-hot">tamper test</span>
              <h3 className="mt-3 text-lg font-semibold text-ice">Forged data does not fail quietly.</h3>
              <p className="mt-2 text-sm leading-relaxed text-frost-mute">
                Pin a doctored copy under a root computed from the honest readings, and verification names the batch, the
                committed root and the recomputed one - then voids the policy.
              </p>
            </div>
            <Link href="/how-it-works" className="mt-4 text-sm font-semibold text-thermal-cool hover:text-ice">
              Read the design →
            </Link>
          </li>
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="grid gap-6 rounded-3xl border border-frost-line bg-frost-900/70 p-8 sm:p-10 md:grid-cols-3">
          <div className="max-w-2xl space-y-3 md:col-span-3">
            <Eyebrow>What is judged, and what is not</Eyebrow>
            <h2 className="text-2xl font-semibold tracking-tight text-ice">Consensus where it is cheap to agree. Judgment only where it is unavoidable.</h2>
          </div>
          {[
            ["Deterministic", "Merkle rebuild, device and window checks, breach run, payout decile", "text-thermal-cool"],
            ["Judged, enum only", "GENUINE · SENSOR_FAULT · INCONSISTENT, plus whether an exclusion applies", "text-thermal-warm"],
            ["Never judged", "The amount. It is a pure function of the verified breach.", "text-paid"],
          ].map(([h, b, c]) => (
            <div key={h} className="space-y-1.5 border-t border-frost-line pt-4">
              <p className={`text-sm font-semibold ${c}`}>{h}</p>
              <p className="text-sm text-frost-mute">{b}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
