import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { batchDocument, canonicalReading, merkleRoot } from "../merkle.mjs";
import { classify, statusName, executionResult, backoffMs } from "../txstatus.mjs";
import { makeSensor, longestBreach, doctor } from "../sensor.mjs";
import { confirmRetrievable } from "../pinata.mjs";

const vectors = JSON.parse(fs.readFileSync(new URL("../../fixtures/merkle-vectors.json", import.meta.url)));
const DEVICE = "0x4A4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a";

test("every shared Merkle vector matches", () => {
  for (const c of vectors.cases) assert.equal(merkleRoot(c.readings), c.root, c.name);
});

test("canonical leaf bytes match the Python reference", () => {
  const c = vectors.cases.find((x) => x.canonical);
  assert.equal(canonicalReading(c.readings[0]), c.canonical);
});

test("device case does not change the root", () => {
  const rs = vectors.cases[4].readings.map((r) => ({ ...r, d: r.d.toUpperCase() }));
  assert.equal(merkleRoot(rs), vectors.cases[4].root);
});

test("float temperatures are refused before they can be pinned", () => {
  assert.throws(() => canonicalReading({ t: 1, c: 4.5, lat: 0, lon: 0, d: DEVICE }));
});

test("batch document round-trips to the same root", () => {
  const rs = vectors.cases[5].readings;
  const doc = JSON.parse(batchDocument({ policyId: 3, seq: 2, device: DEVICE, readings: rs }));
  assert.equal(doc.v, 1);
  assert.equal(doc.device, DEVICE.toLowerCase());
  assert.equal(merkleRoot(doc.readings), vectors.cases[5].root);
});

test("numeric and string statuses normalise to one name", () => {
  assert.equal(statusName({ status: 7 }), "FINALIZED");
  assert.equal(statusName({ status: "7" }), "FINALIZED");
  assert.equal(statusName({ status: "FINALIZED" }), "FINALIZED");
  assert.equal(statusName({ statusName: "ACCEPTED", status: 5 }), "ACCEPTED");
});

test("FINALIZED with a reverted leader receipt is not success", () => {
  const reverted = { status: 7, consensus_data: { leader_receipt: [{ execution_result: "ERROR" }] } };
  assert.deepEqual(classify(reverted), { done: true, ok: false, status: "FINALIZED", exec: "ERROR" });
  const good = { status: 7, consensusData: { leaderReceipt: [{ executionResult: "SUCCESS" }] } };
  assert.equal(classify(good).ok, true);
  assert.equal(executionResult(good), "SUCCESS");
});

test("ACCEPTED is not terminal; UNDETERMINED is a terminal failure", () => {
  assert.equal(classify({ status: 5 }).done, false);
  assert.deepEqual(classify({ status: 6 }).done, true);
  assert.equal(classify({ status: 6 }).ok, false);
});

test("poll backoff is capped at 20s", () => {
  assert.equal(backoffMs(0), 4000);
  assert.equal(backoffMs(20), 20000);
});

function run(scenario, n = 40, step = 30) {
  const s = makeSensor({ scenario, device: DEVICE });
  return Array.from({ length: n }, (_, i) => s.read(1772323200 + i * step));
}

test("nominal never crosses a 5C threshold", () => {
  assert.equal(longestBreach(run("nominal"), 50, 900).seconds, 0);
});

test("breach warms gradually toward ambient and crosses the threshold", () => {
  const rs = run("breach");
  const b = longestBreach(rs, 50, 900);
  assert.ok(b.seconds >= 20 * 30, `breach only ${b.seconds}s`);
  const steps = rs.slice(1).map((r, i) => Math.abs(r.c - rs[i].c));
  assert.ok(Math.max(...steps) < 60, "a real failure has no multi-degree jumps between readings");
});

test("fault jumps instantly and flatlines", () => {
  const rs = run("fault");
  const jump = rs.slice(1).map((r, i) => r.c - rs[i].c);
  assert.ok(Math.max(...jump) > 500);
  assert.ok(rs.slice(-10).every((r) => r.c === 850));
});

test("GPS track stays far under the contract's hard speed limit", () => {
  const rs = run("breach", 40, 30);
  for (let i = 1; i < rs.length; i++) {
    const dLat = (rs[i].lat - rs[i - 1].lat) / 1e5;
    const dLon = (rs[i].lon - rs[i - 1].lon) / 1e5;
    const km = Math.hypot(dLat * 111, dLon * 111 * Math.cos((rs[i].lat / 1e5) * Math.PI / 180));
    assert.ok((km * 3600) / 30 < 1200);
  }
});

test("doctored copy has a different root", () => {
  const rs = run("tamper", 10);
  assert.notEqual(merkleRoot(doctor(rs)), merkleRoot(rs));
});

test("retrieval check refuses a gateway serving different bytes", async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => "other" });
  await assert.rejects(
    confirmRetrievable("https://gw/ipfs/", "bafy", "expected", { attempts: 2, fetchImpl: fakeFetch, sleep: async () => {} }),
    /body differs/,
  );
  const goodFetch = async () => ({ ok: true, status: 200, text: async () => "expected" });
  assert.equal(await confirmRetrievable("https://gw/ipfs/", "bafy", "expected", { fetchImpl: goodFetch, sleep: async () => {} }), true);
});
