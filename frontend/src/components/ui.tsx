import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-frost-line bg-frost-900/80 p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-[0.18em] text-thermal-cool">{children}</p>;
}

export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 max-w-3xl space-y-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-3xl font-semibold tracking-tight text-ice sm:text-4xl">{title}</h1>
      {children ? <div className="text-frost-mute">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-widest text-frost-mute">{label}</p>
      <p className="mt-1 truncate font-mono text-xl text-ice tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-frost-mute">{sub}</p> : null}
    </div>
  );
}

const TONES = {
  cool: "border-thermal-cool/40 bg-thermal-cool/10 text-thermal-cool",
  warm: "border-thermal-warm/40 bg-thermal-warm/10 text-thermal-warm",
  hot: "border-thermal-hot/40 bg-thermal-hot/10 text-thermal-hot",
  paid: "border-paid/40 bg-paid/10 text-paid",
  mute: "border-frost-line bg-frost-850 text-frost-mute",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "mute", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

const STATE_TONE: Record<string, Tone> = {
  ACTIVE: "cool", CLAIMING: "warm", PAID: "paid", VOID: "hot", EXPIRED: "mute",
  FILED: "warm", VERIFIED: "cool", CLOSED: "mute",
  TAMPERED: "hot", NO_BREACH: "mute", SENSOR_FAULT: "warm", INCONSISTENT: "hot", EXCLUDED: "warm",
  GENUINE: "paid", OPEN: "cool",
};

export function StateBadge({ state }: { state: string }) {
  if (!state) return null;
  return <Badge tone={STATE_TONE[state] ?? "mute"}>{state.replace("_", " ")}</Badge>;
}

export function Loading({ label = "Reading the contract…" }: { label?: string }) {
  return <p className="animate-pulse text-sm text-frost-mute">{label}</p>;
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="rounded-lg border border-thermal-hot/40 bg-thermal-hot/10 p-3 text-sm text-thermal-hot">{error}</p>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-widest text-frost-mute">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-frost-mute">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-frost-line bg-frost-950 px-3 py-2 text-sm text-ice placeholder:text-frost-mute/60 focus:border-thermal-cool focus:outline-none";

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`break-all font-mono text-xs ${className}`}>{children}</span>;
}
