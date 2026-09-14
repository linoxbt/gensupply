// Create the demo products and fund the pool.
//
//   GENSUPPLY_PW=... node agent/setup.mjs
//
// Two products: one with production terms (the spec's 5C for 12h), and a
// time-compressed demo product whose minutes-scale windows let one agent run
// finish while a judge watches. The contract logic is identical for both.
import { clientFor, deployment, fmtGen, keystoreAccount, loadEnv, read, write } from "./lib.mjs";

loadEnv();
const { contract } = deployment();
const owner = clientFor(await keystoreAccount(process.env.DEPLOYER_KS ?? "verify-depositor"));
const GEN = 10n ** 18n;
const milli = (n) => (BigInt(n) * GEN) / 1000n;

const EXCLUSIONS =
  "Excursions caused by a customs hold, inspection or port-authority detention outside the " +
  "carrier's control are excluded, as are excursions during a declared power outage at a terminal.";

const products = [
  {
    name: "Reefer Pharma 2-8C - demo (compressed time)",
    // maxGap spans the pin + commit round-trip between batches, which can take minutes.
    threshold: 80, minBreach: 4, fullBreach: 20, fullExcess: 80, maxGap: 900,
    maxPayout: milli(20), premium: milli(2),
  },
  {
    name: "Reefer Produce 5C / 12h",
    threshold: 50, minBreach: 720, fullBreach: 2880, fullExcess: 100, maxGap: 1800,
    maxPayout: milli(20), premium: milli(2),
  },
];

const existing = await read(owner, contract, "list_products");
for (const p of products) {
  if (existing.some((e) => e.name === p.name)) {
    console.log(`product exists: ${p.name}`);
    continue;
  }
  await write(owner, contract, "create_product", [
    p.name, p.threshold, p.minBreach, p.fullBreach, p.fullExcess, p.maxGap, p.maxPayout, p.premium,
    EXCLUSIONS, ["www.cbp.gov", "trade.ec.europa.eu", "customs.gov.ng"],
  ], { label: `create ${p.name}` });
}

const target = milli(Number(process.env.POOL_MILLI ?? 60));
const stats = await read(owner, contract, "pool_stats");
if (BigInt(stats.capital_atto) < target) {
  await write(owner, contract, "deposit", [], { value: target - BigInt(stats.capital_atto), label: "deposit" });
}
const after = await read(owner, contract, "pool_stats");
console.log("pool capital", fmtGen(after.capital_atto), "locked", fmtGen(after.locked_atto));
console.log((await read(owner, contract, "list_products")).map((p) => `#${p.id} ${p.name}`).join("\n"));
