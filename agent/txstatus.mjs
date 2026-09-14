// Transaction-status normalisation, dependency-free so CI can test it.
//
// Three traps this exists for, all measured on Studio:
//  1. getTransaction returns `status` as a numeric ordinal and may leave the
//     name undefined, while other RPC paths return the name as a string.
//  2. ACCEPTED only means the tx landed. The call inside can still have
//     reverted; success is leader_receipt[0].execution_result === "SUCCESS".
//     `txExecutionResultName` is empty on Studio, so checking it waves reverts through.
//  3. Payouts are external messages that execute at FINALIZED, not ACCEPTED.

export const STATUS_NAMES = [
  "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED",
  "UNDETERMINED", "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING",
  "READY_TO_FINALIZE", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
];

export const FAILED_STATES = new Set(["UNDETERMINED", "CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]);

export function statusName(tx) {
  const raw = tx?.statusName ?? tx?.status_name ?? tx?.status;
  if (raw === undefined || raw === null) return "UNKNOWN";
  const asNumber = typeof raw === "number" || typeof raw === "bigint" ? Number(raw) : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  if (!Number.isNaN(asNumber)) return STATUS_NAMES[asNumber] ?? `STATUS_${asNumber}`;
  return String(raw).toUpperCase();
}

function leaderReceipt(tx) {
  const cd = tx?.consensusData ?? tx?.consensus_data;
  const lr = cd?.leaderReceipt ?? cd?.leader_receipt;
  return Array.isArray(lr) ? lr[0] : lr;
}

export function executionResult(tx) {
  const r = leaderReceipt(tx);
  return String(r?.executionResult ?? r?.execution_result ?? "");
}

// Best-effort revert message for logs; shapes differ between SDK versions.
export function errorText(tx) {
  const r = leaderReceipt(tx);
  const candidates = [r?.result?.payload?.readable, r?.result?.payload, r?.genvm_result?.stderr, r?.error, r?.result];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c.slice(0, 400);
  }
  return "";
}

// One step of a poll: what to do with this snapshot of the transaction.
export function classify(tx) {
  const status = statusName(tx);
  if (status === "FINALIZED") {
    const exec = executionResult(tx);
    return { done: true, ok: exec === "SUCCESS", status, exec };
  }
  if (FAILED_STATES.has(status)) return { done: true, ok: false, status, exec: executionResult(tx) };
  return { done: false, ok: false, status, exec: "" };
}

// 4s, 6s, 9s, ... capped at 20s - a flat 4s poll burns Studio's 5000/day quota.
export function backoffMs(attempt) {
  return Math.min(20000, Math.round(4000 * 1.5 ** attempt));
}
