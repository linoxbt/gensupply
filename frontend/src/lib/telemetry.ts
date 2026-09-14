import { BROWSER_GATEWAY } from "./config";
import type { Batch, Reading } from "./types";

/**
 * Re-verifies a policy's telemetry in the visitor's own browser: fetch every
 * batch from IPFS, rebuild the Merkle root with WebCrypto, compare it to the
 * root the device committed on-chain. The same encoding the contract and the
 * agent use (see fixtures/merkle-vectors.json):
 *
 *   leaf = sha256(0x00 || canonical_json(reading))   keys c,d,lat,lon,t
 *   node = sha256(0x01 || left || right)             odd node promoted
 */

export type BatchCheck = {
  batch: Batch;
  status: "verified" | "mismatch" | "invalid" | "unreachable";
  localRoot?: string;
  readings: Reading[];
};

async function sha256(parts: Uint8Array[]): Promise<Uint8Array> {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function canonical(r: Reading): string {
  return JSON.stringify({ c: r.c, d: r.d.toLowerCase(), lat: r.lat, lon: r.lon, t: r.t });
}

export async function merkleRoot(readings: Reading[]): Promise<string> {
  let level = await Promise.all(readings.map((r) => sha256([new Uint8Array([0]), enc.encode(canonical(r))])));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? await sha256([new Uint8Array([1]), level[i], level[i + 1]]) : level[i]);
    }
    level = next;
  }
  return level.length ? hex(level[0]) : "";
}

function isReading(r: unknown): r is Reading {
  const x = r as Reading;
  return !!x && [x.t, x.c, x.lat, x.lon].every(Number.isInteger) && typeof x.d === "string";
}

export async function checkBatch(batch: Batch): Promise<BatchCheck> {
  let text: string;
  try {
    const res = await fetch(BROWSER_GATEWAY + batch.cid);
    if (!res.ok) return { batch, status: "unreachable", readings: [] };
    text = await res.text();
  } catch {
    return { batch, status: "unreachable", readings: [] };
  }
  let doc: { v?: number; readings?: unknown[] };
  try {
    doc = JSON.parse(text);
  } catch {
    return { batch, status: "invalid", readings: [] };
  }
  if (doc.v !== 1 || !Array.isArray(doc.readings) || !doc.readings.every(isReading)) {
    return { batch, status: "invalid", readings: [] };
  }
  const readings = doc.readings as Reading[];
  const localRoot = await merkleRoot(readings);
  return { batch, status: localRoot === batch.merkleRoot ? "verified" : "mismatch", localRoot, readings };
}

export async function checkAll(batches: Batch[]): Promise<BatchCheck[]> {
  return Promise.all(batches.map(checkBatch));
}
