// Batch Merkle tree - byte-for-byte the encoding the contract rebuilds.
//
//   leaf = sha256(0x00 || canonical_json(reading))
//   node = sha256(0x01 || left || right)
//   an odd node at the end of a level is promoted, never duplicated
//
// canonical_json has keys in sorted order (c, d, lat, lon, t), no whitespace,
// integers only, device lowercase. Python's json.dumps(sort_keys=True,
// separators=(",", ":")) and JSON.stringify agree on exactly that shape.
// Both this file and the contract are tested against fixtures/merkle-vectors.json.
import { createHash } from "node:crypto";

const sha256 = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
};

export function canonicalReading(r) {
  for (const k of ["t", "c", "lat", "lon"]) {
    if (!Number.isSafeInteger(r[k])) throw new Error(`reading.${k} must be an integer, got ${r[k]}`);
  }
  return JSON.stringify({ c: r.c, d: String(r.d).toLowerCase(), lat: r.lat, lon: r.lon, t: r.t });
}

export function merkleRoot(readings) {
  if (!readings.length) throw new Error("empty batch has no root");
  let level = readings.map((r) => sha256(Buffer.from([0]), Buffer.from(canonicalReading(r))));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? sha256(Buffer.from([1]), level[i], level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0].toString("hex");
}

// The document pinned to IPFS. The contract parses it, checks the header
// against the on-chain commitment and rebuilds the root from `readings`.
export function batchDocument({ policyId, seq, device, readings }) {
  return JSON.stringify({
    v: 1,
    policy_id: Number(policyId),
    seq: Number(seq),
    device: device.toLowerCase(),
    readings: readings.map((r) => ({ t: r.t, c: r.c, lat: r.lat, lon: r.lon, d: r.d.toLowerCase() })),
  });
}
