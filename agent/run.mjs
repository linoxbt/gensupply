// The GenSupply device agent.
//
//   GENSUPPLY_PW=... node agent/run.mjs --scenario breach [--product 1] [--step 30] [--batch 6]
//
// Reads the (simulated) sensor on a fixed cadence, pins each batch to IPFS,
// commits the CID and Merkle root from the device key, watches for a breach
// with the same rule the contract applies, and when it sees one files the
// claim and drives verification and adjudication itself. Nobody else acts.
//
// Resumable: progress is saved to agent/state/run-<scenario>.json after every
// on-chain step, and a restarted run picks up where it stopped - Studio's daily
// request quota makes losing a whole run expensive.
import path from "node:path";
import { batchDocument, merkleRoot } from "./merkle.mjs";
import { confirmRetrievable, pinBatch } from "./pinata.mjs";
import { doctor, longestBreach, makeSensor, routeInfo } from "./sensor.mjs";
import {
  STATE_DIR, addr, clientFor, deployment, deviceAccount, fmtGen, keystoreAccount, loadEnv, loadJSON, read, saveJSON, sleep, write,
} from "./lib.mjs";

loadEnv();
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const scenario = opt("scenario", "breach");
const productId = Number(opt("product", 1));
const stepSec = Number(opt("step", 30));
const batchSize = Number(opt("batch", 6));
const maxBatches = Number(opt("max-batches", 8));
const route = opt("route", "rotterdam-lagos");
const MAX_BATCHES_PER_CLAIM = 12;

const { contract } = deployment();
const stateFile = path.join(STATE_DIR, `run-${scenario}.json`);
const state = loadJSON(stateFile, null)?.contract === contract ? loadJSON(stateFile) : { contract, scenario, batches: [] };
const save = () => saveJSON(stateFile, state);

const device = await deviceAccount(scenario);
const deviceClient = clientFor(device);
const holderClient = clientFor(await keystoreAccount(process.env.HOLDER_KS ?? "verify-counterparty"));
const config = await read(deviceClient, contract, "get_config");
const gateway = process.env.IPFS_GATEWAY ?? config.ipfs_gateway;
const product = await read(deviceClient, contract, "get_product", [productId]);
const threshold = Number(product.threshold_c_x10);
console.log(`GenSupply agent - scenario=${scenario} contract=${contract}`);
console.log(`device ${device.address}; product #${product.id} "${product.name}" (> ${threshold / 10}C for ${product.min_breach_minutes} min)`);

// 1. Cover. The holder buys a policy naming this device.
if (!state.policyId) {
  const { origin, destination } = routeInfo(route);
  const before = await read(holderClient, contract, "pool_stats");
  await write(holderClient, contract, "buy_policy",
    [productId, addr(device.address), `GS-${scenario.toUpperCase()}-${Date.now() % 100000}`, origin, destination, 24],
    { value: BigInt(product.premium_atto), label: "buy_policy" });
  const mine = await read(holderClient, contract, "policies_of", [addr(holderClient.account.address)]);
  const policy = mine.filter((p) => p.device.toLowerCase() === device.address.toLowerCase()).at(-1);
  if (!policy || Number(policy.id) <= Number(before.policies) - 1) throw new Error("policy not found after purchase");
  state.policyId = Number(policy.id);
  save();
}
console.log(`policy #${state.policyId}`);

// Anchor the simulated failure to real weather at the port: a dead reefer
// warms toward outside air plus solar gain, which is exactly what validators
// will check the readings against.
if (state.ambientX10 === undefined) {
  const { from } = routeInfo(route);
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${from[0]}&longitude=${from[1]}&current=temperature_2m`);
    state.ambientX10 = Math.round(((await res.json()).current.temperature_2m + 4) * 10);
  } catch {
    state.ambientX10 = 220;
  }
  save();
}
console.log(`ambient target ${state.ambientX10 / 10}C`);

const sensor = makeSensor({ scenario, device: device.address, route, ambientX10: state.ambientX10, seed: state.policyId * 31 });
// Replay the sensor to its saved position so a resumed run continues the same series.
for (let i = 0; i < state.batches.length * batchSize; i++) sensor.read(0);

const pinnedReadings = () => state.batches.flatMap((b) => b.pinned);

// 2. Telemetry loop.
while (!state.claimId && state.batches.length < maxBatches) {
  const seq = state.batches.length + 1;
  const honest = [];
  for (let i = 0; i < batchSize; i++) {
    honest.push(sensor.read(Date.now() / 1000));
    const last = honest.at(-1);
    console.log(`  read ${new Date(last.t * 1000).toISOString().slice(11, 19)}  ${(last.c / 10).toFixed(1)}C`);
    if (i < batchSize - 1) await sleep(stepSec * 1000);
  }
  // The compromised uploader in the tamper scenario pins a hotter copy but
  // commits the root of what the probe really recorded.
  const pinned = scenario === "tamper" && seq >= 2 ? doctor(honest) : honest;
  const root = merkleRoot(honest);
  const body = batchDocument({ policyId: state.policyId, seq, device: device.address, readings: pinned });
  const cid = await pinBatch(process.env.PINATA_JWT, `gensupply-p${state.policyId}-b${seq}`, body);
  console.log(`batch ${seq}: pinned ${cid}`);
  await confirmRetrievable(gateway, cid, body);
  await write(deviceClient, contract, "commit_batch",
    [state.policyId, seq, cid, root, honest[0].t, honest.at(-1).t, honest.length], { label: `commit_batch ${seq}` });
  state.batches.push({ seq, cid, root, pinned });
  save();

  const breach = longestBreach(pinnedReadings(), threshold, Number(product.max_gap_seconds));
  console.log(`  local rule: ${Math.floor(breach.seconds / 60)} min above threshold, peak +${breach.peak / 10}C`);
  if (breach.seconds >= Number(product.min_breach_minutes) * 60) {
    const last = seq;
    const first = Math.max(1, last - MAX_BATCHES_PER_CLAIM + 1);
    console.log(`breach detected - filing claim over batches ${first}..${last}`);
    await write(deviceClient, contract, "file_claim", [state.policyId, first, last], { label: "file_claim" });
    const claims = await read(deviceClient, contract, "claims_for_policy", [state.policyId]);
    state.claimId = Number(claims.at(-1).id);
    save();
  } else {
    await sleep(stepSec * 1000);
  }
}

if (!state.claimId) {
  console.log(`no breach after ${state.batches.length} batches - no claim filed`);
  process.exit(0);
}

// 3. Settlement, driven by the agent end to end.
let claim = await read(deviceClient, contract, "get_claim", [state.claimId]);
if (claim.state === "FILED") {
  await write(deviceClient, contract, "verify_telemetry", [state.claimId], { label: "verify_telemetry" });
  claim = await read(deviceClient, contract, "get_claim", [state.claimId]);
}
console.log(`verification: ${claim.state} ${claim.outcome || ""} breach=${claim.breach_minutes}min peak=+${Number(claim.peak_excess_c_x10) / 10}C payout=${Number(claim.payout_bps) / 100}%`);
for (const b of claim.integrity?.batches ?? []) {
  console.log(`  batch ${b.seq} ${b.ok ? "root matches" : `FAILED: ${b.why}`}`);
}

if (claim.state === "VERIFIED") {
  const holder = holderClient.account.address;
  const before = await holderClient.getBalance({ address: holder });
  await write(deviceClient, contract, "adjudicate_claim", [state.claimId], { label: "adjudicate_claim" });
  claim = await read(deviceClient, contract, "get_claim", [state.claimId]);
  const after = await holderClient.getBalance({ address: holder });
  console.log(`adjudication: ${claim.outcome} (${claim.classification}) - ${claim.reasoning}`);
  if (claim.outcome === "PAID") console.log(`paid ${fmtGen(claim.payout_atto)}; holder balance +${fmtGen(after - before)}`);
}
state.outcome = claim.outcome;
save();
console.log(`final: claim #${state.claimId} ${claim.outcome}; policy ${(await read(deviceClient, contract, "get_policy", [state.policyId])).state}`);
