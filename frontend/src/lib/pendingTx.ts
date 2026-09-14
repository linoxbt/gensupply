"use client";

/**
 * A write that was broadcast but has not reached a terminal state. Payouts
 * execute at finalization, so losing the hash in that window (a reload, a
 * closed tab) would leave the user no way to learn what happened.
 */
export type PendingTx = { hash: string; method: string; startedAt: number };

const KEY = "gensupply-pending-tx";

function load(): PendingTx[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingTx[]) : [];
  } catch {
    return [];
  }
}

function store(list: PendingTx[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable must never break the write */
  }
}

export function recordPending(hash: string, method: string) {
  store([...load().filter((t) => t.hash !== hash), { hash, method, startedAt: Date.now() }]);
}

export function clearPending(hash: string) {
  store(load().filter((t) => t.hash !== hash));
}

export function listPending(): PendingTx[] {
  return load();
}
