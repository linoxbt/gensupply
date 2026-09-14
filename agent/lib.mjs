// Chain access for the agent and operator scripts (Studio Network).
//
// Keystores are decrypted in memory only; set GENSUPPLY_PW. The raw private
// key is never written or printed. Device keys are generated per scenario and
// kept encrypted under agent/state/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CalldataAddress } from "genlayer-js/types";
import { Wallet } from "ethers";
import { backoffMs, classify, errorText } from "./txstatus.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const STATE_DIR = path.join(HERE, "state");
export const KEYSTORE_DIR = process.env.KEYSTORE_DIR ?? "/root/.genlayer/keystores";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadEnv() {
  const file = path.join(HERE, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function password() {
  const pw = process.env.GENSUPPLY_PW;
  if (!pw) throw new Error("set GENSUPPLY_PW to decrypt keystores");
  return pw;
}

export async function keystoreAccount(name) {
  const json = fs.readFileSync(path.join(KEYSTORE_DIR, `${name}.json`), "utf8");
  const wallet = await Wallet.fromEncryptedJson(json, password());
  return createAccount(wallet.privateKey);
}

// A device identity for a scenario, created once and reused on resume.
export async function deviceAccount(label) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = path.join(STATE_DIR, `device-${label}.json`);
  if (fs.existsSync(file)) {
    const wallet = await Wallet.fromEncryptedJson(fs.readFileSync(file, "utf8"), password());
    return createAccount(wallet.privateKey);
  }
  const wallet = Wallet.createRandom();
  fs.writeFileSync(file, await wallet.encrypt(password()), { mode: 0o600 });
  return createAccount(wallet.privateKey);
}

export function clientFor(account) {
  return createClient({ chain: studionet, account });
}

export function readOnlyClient() {
  return createClient({ chain: studionet });
}

// An `Address` parameter must be sent as CalldataAddress. A bare hex string
// encodes as `str`, and the call then fails in decode while still reporting ACCEPTED.
export function addr(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) throw new Error(`not an address: ${hex}`);
  return new CalldataAddress(Uint8Array.from(Buffer.from(clean, "hex")));
}

// Calldata dicts can come back as Maps and integers as bigints.
export function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [k, plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object" && !(v instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

export async function read(client, address, functionName, args = []) {
  return plain(await client.readContract({ address, functionName, args }));
}

// Waits for FINALIZED and a SUCCESS leader receipt. Anything else throws.
export async function waitFinal(client, hash, label, maxMs = 15 * 60_000) {
  const start = Date.now();
  let attempt = 0;
  let lastStatus = "";
  while (Date.now() - start < maxMs) {
    let tx = null;
    try {
      tx = await client.getTransaction({ hash });
    } catch (err) {
      const msg = String(err?.message ?? err);
      if (/rate limit|429|5000 requests/i.test(msg)) console.log(`  ${label}: rate limited, backing off`);
      else console.log(`  ${label}: read error ${msg.slice(0, 120)}`);
    }
    if (tx) {
      const k = classify(tx);
      if (k.status !== lastStatus) {
        console.log(`  ${label}: ${k.status}`);
        lastStatus = k.status;
      }
      if (k.done) {
        if (!k.ok) throw new Error(`${label} failed: ${k.status}/${k.exec || "-"} ${errorText(tx)}`);
        return tx;
      }
    }
    await sleep(backoffMs(attempt++));
  }
  throw new Error(`${label}: gave up after ${Math.round(maxMs / 1000)}s at ${lastStatus || "unknown"}`);
}

export async function write(client, address, functionName, args = [], { value = 0n, label } = {}) {
  const hash = await client.writeContract({ address, functionName, args, value: BigInt(value) });
  console.log(`  ${label ?? functionName}: tx ${hash}`);
  return waitFinal(client, hash, label ?? functionName);
}

export function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function saveJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function deployment() {
  const d = loadJSON(path.join(STATE_DIR, "deployment.json"), null);
  const contract = process.env.CONTRACT ?? d?.contract;
  if (!contract) throw new Error("no CONTRACT env and no agent/state/deployment.json - run npm run deploy");
  return { ...d, contract };
}

export const fmtGen = (atto) => `${(Number(BigInt(atto)) / 1e18).toFixed(6)} GEN`;
