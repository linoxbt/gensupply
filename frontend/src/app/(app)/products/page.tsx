"use client";

import Link from "next/link";
import { useState } from "react";
import TxButton from "@/components/TxButton";
import { Badge, Card, ErrorNote, Field, Loading, PageTitle, inputClass } from "@/components/ui";
import { celsius, duration, gen } from "@/lib/format";
import { buyPolicy, listProducts } from "@/lib/gensupply";
import type { Product } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

function BuyForm({ product }: { product: Product }) {
  const [device, setDevice] = useState("");
  const [ref, setRef] = useState("MSKU-4812207");
  const [origin, setOrigin] = useState("Rotterdam, NL");
  const [destination, setDestination] = useState("Lagos, NG");
  const [hours, setHours] = useState(24);
  const [boughtAt, setBoughtAt] = useState<number>();
  const validDevice = /^0x[0-9a-fA-F]{40}$/.test(device);

  return (
    <div className="mt-5 grid gap-4 border-t border-frost-line pt-5 sm:grid-cols-2">
      <Field label="Device address" hint="The key on the logger. Run the agent to get one: npm run agent -- --scenario breach">
        <input className={inputClass} placeholder="0x…" value={device} onChange={(e) => setDevice(e.target.value.trim())} />
      </Field>
      <Field label="Container / shipment ref">
        <input className={inputClass} value={ref} onChange={(e) => setRef(e.target.value)} />
      </Field>
      <Field label="Origin">
        <input className={inputClass} value={origin} onChange={(e) => setOrigin(e.target.value)} />
      </Field>
      <Field label="Destination">
        <input className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)} />
      </Field>
      <Field label="Cover period (hours)">
        <input className={inputClass} type="number" min={1} max={2160} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
      </Field>
      <div className="flex items-end">
        <TxButton
          label={`Buy cover · ${gen(product.premiumAtto)} GEN`}
          disabled={!validDevice || !ref || !origin || !destination || hours < 1}
          hint={!validDevice ? "Enter the device address to enable." : undefined}
          action={(s, onPhase) =>
            buyPolicy(s, { productId: product.id, device, shipmentRef: ref, origin, destination, hours, premiumAtto: BigInt(product.premiumAtto) }, onPhase)
          }
          onDone={() => setBoughtAt(Date.now())}
        />
      </div>
      {boughtAt ? (
        <p className="text-sm text-paid sm:col-span-2">
          Policy issued. Find it under <Link className="underline" href="/policies">Shipments</Link>.
        </p>
      ) : null}
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-frost-mute">PRODUCT #{product.id}</p>
          <h2 className="mt-1 text-xl font-semibold text-ice">{product.name}</h2>
        </div>
        <span className="shrink-0">
          <Badge tone={product.state === "OPEN" ? "cool" : "mute"}>{product.state}</Badge>
        </span>
      </div>

      <p className="mt-4 text-ice">
        Pays when cargo stays above <span className="font-semibold text-thermal-hot">{celsius(product.thresholdX10)}</span> for more than{" "}
        <span className="font-semibold text-thermal-hot">{duration(product.minBreachMinutes)}</span>.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        {[
          ["Premium", `${gen(product.premiumAtto)} GEN`],
          ["Max payout", `${gen(product.maxPayoutAtto)} GEN`],
          ["Full payout at", `${duration(product.fullBreachMinutes)} or +${celsius(product.fullExcessX10)}`],
          ["Data gap breaks a run", `${Math.round(product.maxGapSeconds / 60)} min`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs uppercase tracking-widest text-frost-mute">{k}</dt>
            <dd className="mt-1 font-mono text-ice">{v}</dd>
          </div>
        ))}
      </dl>

      {product.exclusions ? (
        <p className="mt-5 border-l-2 border-thermal-warm/60 pl-3 text-sm text-frost-mute">
          <span className="text-thermal-warm">Exclusions. </span>
          {product.exclusions}
        </p>
      ) : null}

      {product.state === "OPEN" ? (
        open ? (
          <BuyForm product={product} />
        ) : (
          <button onClick={() => setOpen(true)} className="mt-5 rounded-full border border-frost-line px-5 py-2 text-sm font-semibold text-ice hover:border-thermal-cool">
            Insure a shipment
          </button>
        )
      ) : null}
    </Card>
  );
}

export default function ProductsPage() {
  const { data, error, loading } = useAsync(listProducts);
  return (
    <>
      <PageTitle eyebrow="Cover" title="Pick the temperature your cargo cannot cross.">
        Premiums are fixed per product. Payout scales with how long and how far past the threshold the cargo went - computed
        from verified readings, in deciles, so a short dip pays a little and a ruined load pays in full.
      </PageTitle>
      {loading ? <Loading /> : null}
      <ErrorNote error={error} />
      <div className="grid gap-5 lg:grid-cols-2">
        {data?.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </>
  );
}
