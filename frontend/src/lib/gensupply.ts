import { createClient } from "genlayer-js";
import { CalldataAddress } from "genlayer-js/types";
import type { Address, CalldataEncodable, Hash } from "genlayer-js/types";
import { CHAIN, RPC_URL, requireAddress } from "./config";
import { clearPending, recordPending } from "./pendingTx";
import type { EIP1193Provider } from "./walletProvider";
import type { Batch, Claim, Policy, PoolStats, Product } from "./types";

/**
 * Every call goes to the live contract. There is no mock fallback: when a
 * read fails the UI says so rather than inventing state.
 */

let reader: ReturnType<typeof createClient> | undefined;
function readClient() {
  if (!reader) reader = createClient({ chain: CHAIN, endpoint: RPC_URL });
  return reader;
}

/** A bare hex string encodes as calldata `str`; an `Address` parameter needs this wrapper. */
export function asAddress(hex: string): CalldataAddress {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) throw new Error(`Not an address: ${hex}`);
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new CalldataAddress(bytes);
}

type Plain = string | number | boolean | null | Plain[] | { [k: string]: Plain };

/** Calldata dicts can arrive as Maps and integers as bigints. */
function plain(v: unknown): Plain {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object" && !(v instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v as Plain;
}

async function read<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const raw = await readClient().readContract({ address: requireAddress(), functionName, args });
  return plain(raw) as T;
}

// ------------------------------------------------------------ tx finality

const STATUS_NAMES = [
  "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "UNDETERMINED",
  "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING", "READY_TO_FINALIZE",
  "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
];
const FAILED = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

type Receipt = { execution_result?: string; executionResult?: string };
type TxRecord = {
  status?: number | string;
  statusName?: string;
  status_name?: string;
  consensus_data?: { leader_receipt?: Receipt | Receipt[] };
  consensusData?: { leaderReceipt?: Receipt | Receipt[] };
};

function statusOf(tx: TxRecord): string {
  const raw = tx.statusName ?? tx.status_name ?? tx.status;
  if (raw === undefined || raw === null) return "UNKNOWN";
  if (/^\d+$/.test(String(raw))) return STATUS_NAMES[Number(raw)] ?? `STATUS_${raw}`;
  return String(raw).toUpperCase();
}

function executionResult(tx: TxRecord): string {
  const lr = tx.consensus_data?.leader_receipt ?? tx.consensusData?.leaderReceipt;
  const r = Array.isArray(lr) ? lr[0] : lr;
  return String(r?.execution_result ?? r?.executionResult ?? "");
}

export type TxPhase = "signing" | "submitted" | "accepted" | "finalized";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Nothing short of FINALIZED with a SUCCESS leader receipt counts. ACCEPTED
 * only means the tx landed - the call may have reverted - and every payout is
 * an external message that executes at finalization, so "done" before then
 * would be a claim about money that has not moved.
 */
async function awaitFinalized(client: ReturnType<typeof createClient>, hash: string, fn: string, onPhase?: (p: TxPhase) => void) {
  const start = Date.now();
  let attempt = 0;
  let sawAccepted = false;
  while (Date.now() - start < 15 * 60_000) {
    let tx: TxRecord | undefined;
    try {
      tx = (await client.getTransaction({ hash: hash as Hash })) as TxRecord;
    } catch {
      /* transient read failure (or rate limit that looks like CORS) - keep polling */
    }
    if (tx) {
      const status = statusOf(tx);
      if (status === "FINALIZED") {
        const exec = executionResult(tx);
        if (exec && exec !== "SUCCESS") {
          throw new Error(`${fn} finalized but the call did not succeed (${exec}, tx ${hash}). Nothing changed.`);
        }
        onPhase?.("finalized");
        return;
      }
      if (FAILED.has(status)) throw new Error(`${fn} ended in ${status} (tx ${hash}). Nothing changed; it is safe to retry.`);
      if (status === "ACCEPTED" && !sawAccepted) {
        sawAccepted = true;
        onPhase?.("accepted");
      }
    }
    await sleep(Math.min(20000, 3000 * 1.4 ** attempt++));
  }
  throw new Error(`${fn} has not finalized yet (tx ${hash}). Check the explorer before retrying.`);
}

export type Signer = { provider: EIP1193Provider; account: Address };

async function send(s: Signer, functionName: string, args: CalldataEncodable[], value = 0n, onPhase?: (p: TxPhase) => void) {
  const client = createClient({ chain: CHAIN, endpoint: RPC_URL, provider: s.provider as never, account: s.account });
  const hash = (await client.writeContract({ address: requireAddress(), functionName, args, value })) as string;
  recordPending(hash, functionName);
  onPhase?.("submitted");
  try {
    await awaitFinalized(client, hash, functionName, onPhase);
  } finally {
    clearPending(hash);
  }
  return hash;
}

// ------------------------------------------------------------------ reads

type Row = Record<string, Plain>;
const n = (v: Plain) => Number(v ?? 0);
const s = (v: Plain) => String(v ?? "");

function toProduct(p: Row): Product {
  return {
    id: s(p.id), name: s(p.name), thresholdX10: n(p.threshold_c_x10), minBreachMinutes: n(p.min_breach_minutes),
    fullBreachMinutes: n(p.full_breach_minutes), fullExcessX10: n(p.full_excess_c_x10), maxGapSeconds: n(p.max_gap_seconds),
    maxPayoutAtto: s(p.max_payout_atto), premiumAtto: s(p.premium_atto), exclusions: s(p.exclusions),
    customsHosts: (p.customs_hosts as string[]) ?? [], state: s(p.state) as Product["state"], createdAt: n(p.created_at),
  };
}

function toPolicy(p: Row): Policy {
  return {
    id: s(p.id), productId: s(p.product_id), holder: s(p.holder), device: s(p.device), shipmentRef: s(p.shipment_ref),
    origin: s(p.origin), destination: s(p.destination), premiumPaidAtto: s(p.premium_paid_atto), startsAt: n(p.starts_at),
    expiresAt: n(p.expires_at), state: s(p.state) as Policy["state"], batchCount: n(p.batch_count), claimCount: n(p.claim_count),
    openClaimId: s(p.open_claim_id), payoutAtto: s(p.payout_atto),
  };
}

function toBatch(b: Row): Batch {
  return {
    policyId: s(b.policy_id), seq: n(b.seq), cid: s(b.cid), merkleRoot: s(b.merkle_root), tFrom: n(b.t_from),
    tTo: n(b.t_to), count: n(b.count), committedAt: n(b.committed_at),
  };
}

function toClaim(c: Row): Claim {
  return {
    id: s(c.id), policyId: s(c.policy_id), filer: s(c.filer), firstSeq: n(c.first_seq), lastSeq: n(c.last_seq),
    state: s(c.state) as Claim["state"], outcome: s(c.outcome) as Claim["outcome"],
    integrity: (c.integrity as unknown as Claim["integrity"]) ?? null, features: (c.features as unknown as Claim["features"]) ?? null,
    breachMinutes: n(c.breach_minutes), peakExcessX10: n(c.peak_excess_c_x10), severityBps: n(c.severity_bps),
    payoutBps: n(c.payout_bps), payoutAtto: s(c.payout_atto), classification: s(c.classification), excluded: s(c.excluded),
    reasoning: s(c.reasoning), customsUrl: s(c.customs_url), filedAt: n(c.filed_at), verifiedAt: n(c.verified_at),
    closedAt: n(c.closed_at),
  };
}

export async function getPoolStats(): Promise<PoolStats> {
  const p = await read<Row>("pool_stats");
  return {
    capitalAtto: s(p.capital_atto), lockedAtto: s(p.locked_atto), freeAtto: s(p.free_atto), totalShares: s(p.total_shares),
    premiumsAtto: s(p.premiums_atto), payoutsAtto: s(p.payouts_atto), products: n(p.products), policies: n(p.policies),
    claims: n(p.claims),
  };
}

export const listProducts = async () => (await read<Row[]>("list_products")).map(toProduct);
export const getProduct = async (id: string) => toProduct(await read<Row>("get_product", [Number(id)]));
export const getPolicy = async (id: string) => toPolicy(await read<Row>("get_policy", [Number(id)]));
export const listPolicies = async (offset = 0, limit = 100) => (await read<Row[]>("list_policies", [offset, limit])).map(toPolicy);
export const listBatches = async (policyId: string) => (await read<Row[]>("list_batches", [Number(policyId)])).map(toBatch);
export const claimsForPolicy = async (policyId: string) => (await read<Row[]>("claims_for_policy", [Number(policyId)])).map(toClaim);
export const sharesOf = (holder: string) => read<string>("shares_of", [asAddress(holder)]);
export const getConfig = () => read<Row>("get_config");

// ----------------------------------------------------------------- writes

type Phase = ((p: TxPhase) => void) | undefined;

export const buyPolicy = (
  signer: Signer,
  p: { productId: string; device: string; shipmentRef: string; origin: string; destination: string; hours: number; premiumAtto: bigint },
  onPhase?: Phase,
) => send(signer, "buy_policy", [Number(p.productId), asAddress(p.device), p.shipmentRef, p.origin, p.destination, p.hours], p.premiumAtto, onPhase);

export const transferPolicy = (signer: Signer, policyId: string, to: string, onPhase?: Phase) =>
  send(signer, "transfer_policy", [Number(policyId), asAddress(to)], 0n, onPhase);

export const fileClaim = (signer: Signer, policyId: string, first: number, last: number, onPhase?: Phase) =>
  send(signer, "file_claim", [Number(policyId), first, last], 0n, onPhase);

export const attachCustomsDoc = (signer: Signer, claimId: string, url: string, onPhase?: Phase) =>
  send(signer, "attach_customs_doc", [Number(claimId), url], 0n, onPhase);

export const verifyTelemetry = (signer: Signer, claimId: string, onPhase?: Phase) =>
  send(signer, "verify_telemetry", [Number(claimId)], 0n, onPhase);

export const adjudicateClaim = (signer: Signer, claimId: string, onPhase?: Phase) =>
  send(signer, "adjudicate_claim", [Number(claimId)], 0n, onPhase);

export const releaseExpired = (signer: Signer, policyId: string, onPhase?: Phase) =>
  send(signer, "release_expired", [Number(policyId)], 0n, onPhase);

export const deposit = (signer: Signer, value: bigint, onPhase?: Phase) => send(signer, "deposit", [], value, onPhase);

export const withdraw = (signer: Signer, shares: bigint, onPhase?: Phase) => send(signer, "withdraw", [shares], 0n, onPhase);
