const ATTO = 10n ** 18n;

export function gen(atto: string | bigint, decimals = 4): string {
  const v = typeof atto === "bigint" ? atto : BigInt(atto || "0");
  const whole = v / ATTO;
  const frac = (v % ATTO).toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function toAtto(input: string): bigint {
  const [whole, frac = ""] = input.trim().split(".");
  return BigInt(whole || "0") * ATTO + BigInt((frac + "0".repeat(18)).slice(0, 18) || "0");
}

export const celsius = (x10: number) => `${(x10 / 10).toFixed(1)}°C`;
export const pct = (bps: number) => `${Math.round(bps / 100)}%`;
export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h?: string, n = 8) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : "—");

export function when(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function clock(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
