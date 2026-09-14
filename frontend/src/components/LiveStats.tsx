"use client";

import { gen } from "@/lib/format";
import { getPoolStats } from "@/lib/gensupply";
import { useAsync } from "@/lib/useAsync";
import { Stat } from "./ui";

export function LiveStats() {
  const { data, error } = useAsync(getPoolStats);
  if (error) return <p className="text-sm text-thermal-warm">Live stats unavailable: {error.slice(0, 120)}</p>;
  const v = (x?: string) => (data ? `${gen(x ?? "0")} GEN` : "…");
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Pool capital" value={v(data?.capitalAtto)} />
      <Stat label="Reserved for cover" value={v(data?.lockedAtto)} />
      <Stat label="Premiums" value={v(data?.premiumsAtto)} />
      <Stat label="Paid out" value={v(data?.payoutsAtto)} />
      <Stat label="Shipments" value={data ? data.policies : "…"} />
      <Stat label="Claims" value={data ? data.claims : "…"} />
    </div>
  );
}
