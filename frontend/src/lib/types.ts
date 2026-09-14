export type Product = {
  id: string;
  name: string;
  thresholdX10: number;
  minBreachMinutes: number;
  fullBreachMinutes: number;
  fullExcessX10: number;
  maxGapSeconds: number;
  maxPayoutAtto: string;
  premiumAtto: string;
  exclusions: string;
  customsHosts: string[];
  state: "OPEN" | "CLOSED";
  createdAt: number;
};

export type PolicyState = "ACTIVE" | "CLAIMING" | "PAID" | "VOID" | "EXPIRED";

export type Policy = {
  id: string;
  productId: string;
  holder: string;
  device: string;
  shipmentRef: string;
  origin: string;
  destination: string;
  premiumPaidAtto: string;
  startsAt: number;
  expiresAt: number;
  state: PolicyState;
  batchCount: number;
  claimCount: number;
  openClaimId: string;
  payoutAtto: string;
};

export type Batch = {
  policyId: string;
  seq: number;
  cid: string;
  merkleRoot: string;
  tFrom: number;
  tTo: number;
  count: number;
  committedAt: number;
};

export type IntegrityBatch = {
  seq: number;
  cid: string;
  committed_root: string;
  recomputed_root: string;
  ok: boolean;
  why: string;
};

export type Breach = {
  seconds: number;
  peak_excess_x10: number;
  start_t: number;
  end_t: number;
  readings: number;
};

export type Features = {
  readings: number;
  min_c_x10: number;
  max_c_x10: number;
  max_step_x10_per_min: number;
  longest_flatline_readings: number;
  max_gap_seconds: number;
  max_speed_kmh: number;
  breach: Breach;
};

export type ClaimState = "FILED" | "VERIFIED" | "CLOSED";
export type Outcome = "" | "TAMPERED" | "NO_BREACH" | "SENSOR_FAULT" | "INCONSISTENT" | "EXCLUDED" | "PAID";

export type Claim = {
  id: string;
  policyId: string;
  filer: string;
  firstSeq: number;
  lastSeq: number;
  state: ClaimState;
  outcome: Outcome;
  integrity: { ok: boolean; batches: IntegrityBatch[] } | null;
  features: Features | null;
  breachMinutes: number;
  peakExcessX10: number;
  severityBps: number;
  payoutBps: number;
  payoutAtto: string;
  classification: string;
  excluded: string;
  reasoning: string;
  customsUrl: string;
  filedAt: number;
  verifiedAt: number;
  closedAt: number;
};

export type PoolStats = {
  capitalAtto: string;
  lockedAtto: string;
  freeAtto: string;
  totalShares: string;
  premiumsAtto: string;
  payoutsAtto: string;
  products: number;
  policies: number;
  claims: number;
};

export type Reading = { t: number; c: number; lat: number; lon: number; d: string };
