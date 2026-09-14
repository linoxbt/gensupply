"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import TxButton from "@/components/TxButton";
import { Card, ErrorNote, Eyebrow, Field, Loading, PageTitle, Stat, inputClass } from "@/components/ui";
import { gen, toAtto } from "@/lib/format";
import { deposit, getPoolStats, sharesOf, withdraw } from "@/lib/gensupply";
import { useAsync } from "@/lib/useAsync";
import { REOWN_PROJECT_ID } from "@/lib/wagmiConfig";

function MyShares({ totalShares, capital, reload }: { totalShares: string; capital: string; reload: () => void }) {
  const { address } = useAccount();
  const shares = useAsync(async () => (address ? sharesOf(address) : "0"), [address]);
  const [amount, setAmount] = useState("0.01");
  const held = BigInt(shares.data ?? "0");
  const value = BigInt(totalShares) > 0n ? (held * BigInt(capital)) / BigInt(totalShares) : 0n;
  const done = () => {
    reload();
    void shares.reload();
  };

  return (
    <Card className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <Eyebrow>Underwrite</Eyebrow>
        <Field label="Deposit (GEN)">
          <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <TxButton label="Deposit capital" disabled={!/^\d*\.?\d+$/.test(amount)} action={(s, p) => deposit(s, toAtto(amount), p)} onDone={done} />
      </div>
      <div className="space-y-3">
        <Eyebrow>Your position</Eyebrow>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Shares" value={gen(held)} />
          <Stat label="Worth now" value={`${gen(value)} GEN`} />
        </div>
        <TxButton
          variant="ghost"
          label="Withdraw all"
          disabled={held === 0n}
          hint="Refused if it would leave live cover unreserved."
          action={(s, p) => withdraw(s, held, p)}
          onDone={done}
        />
      </div>
    </Card>
  );
}

export default function PoolPage() {
  const { data, error, loading, reload } = useAsync(getPoolStats);
  const utilisation = data && BigInt(data.capitalAtto) > 0n ? Number((BigInt(data.lockedAtto) * 1000n) / BigInt(data.capitalAtto)) / 10 : 0;

  return (
    <>
      <PageTitle eyebrow="Pool" title="Capital that stands behind every container.">
        Every policy reserves its maximum payout the moment it is sold. Premiums accrue to shares; a payout dilutes every
        provider at once, so nobody can exit ahead of a loss at par.
      </PageTitle>
      {loading ? <Loading /> : null}
      <ErrorNote error={error} />
      {data ? (
        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Capital" value={`${gen(data.capitalAtto)} GEN`} />
              <Stat label="Reserved" value={`${gen(data.lockedAtto)} GEN`} sub={`${utilisation}% of capital`} />
              <Stat label="Premiums earned" value={`${gen(data.premiumsAtto)} GEN`} />
              <Stat label="Claims paid" value={`${gen(data.payoutsAtto)} GEN`} />
            </div>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-frost-850" role="img" aria-label={`${utilisation}% of capital reserved`}>
              <div className="h-full rounded-full bg-thermal-cool" style={{ width: `${Math.min(100, utilisation)}%` }} />
            </div>
          </Card>
          {REOWN_PROJECT_ID ? <MyShares totalShares={data.totalShares} capital={data.capitalAtto} reload={reload} /> : null}
        </div>
      ) : null}
    </>
  );
}
