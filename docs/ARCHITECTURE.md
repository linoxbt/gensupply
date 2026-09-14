# GenSupply architecture

## Why the spec's Solidity pieces are absent

The original brief described an ERC-1155 policy NFT, an escrow contract, a claim
contract and a `GenLayer.adjudicate()` adapter. None of those exist as separate
things on GenLayer. An Intelligent Contract holds native GEN, keeps arbitrary
storage, fetches from the web and runs LLM prompts, all under validator
consensus. So GenSupply is a single Python contract, `contracts/gensupply.py`.

| Brief | GenSupply |
|---|---|
| ERC-1155 policy NFT | `Policy` records with `holder`, `transfer_policy`, and `balance_of` / `policies_of` views |
| Escrow + claim contract | The contract's own balance. `buy_policy` / `deposit` are payable, and payouts are external `emit_transfer` messages |
| Device public key in the NFT | `Policy.device` is an address. `commit_batch` only accepts that sender |
| Merkle proof of integrity | The device commits the root. Validators rebuild it from the IPFS bytes inside consensus |
| `GenLayer.adjudicate()` | `verify_telemetry` (deterministic) + `adjudicate_claim` (judged) |

## Components

```
agent/            Node device agent + operator scripts (genlayer-js)
  sensor.mjs      simulated reefer: nominal | breach | fault | tamper
  merkle.mjs      batch document + Merkle root (shared encoding)
  pinata.mjs      pinFileToIPFS + gateway retrieval check
  txstatus.mjs    finality-safe status classification
  run.mjs         the autonomous loop: buy → read → pin → commit → detect → file → verify → adjudicate
  deploy.mjs      deploy + constructor verification
  setup.mjs       demo products + pool funding
contracts/        gensupply.py
fixtures/         merkle-vectors.json + its standalone generator
frontend/         Next.js + genlayer-js + Reown AppKit
tests/direct      gltest direct mode (real SDK storage and calldata)
tests/unit        in-process GenVM stub (time, balances, full state machine)
```

## The claim, stage by stage

### 1. `commit_batch`: cheap, frequent, no network access

Guards: sender is the bound device. `seq` is the next one. The CID looks like a CID. The root is 32 hex bytes.
The count is at most 720. The window starts at or after purchase and ends by expiry. It does not overlap the
previous batch. It is not in the future (5 min skew). **It is not older than
`max_commit_lag_seconds`.** The last guard stops backdating: a root has to be committed
while nobody yet knows whether a claim will follow.

### 2. `verify_telemetry`: consensus round 1, deterministic

```python
docs = json.loads(gl.eq_principle.strict_eq(fetch_all))   # raw web.get of each CID
integrity, readings = _check_integrity(batches, docs, policy_id, device)
```

`fetch_all` returns a canonical JSON parse of each document, which is a pure function of
content-addressed bytes, so `strict_eq` agrees across honest validators. Parsing never
raises for a malformed document. It reports the problem, because garbage behind the device's
own CID is the device's fault. HTTP 5xx/429 raises `[TRANSIENT]` and the claim stays
`FILED`.

Web `render` is deliberately not used. It returns browser-extracted text, which cannot
reproduce a byte hash (see the evidence-hash trap in the GenHire notes). `web.get` is the
raw body.

Any failed batch → `TAMPERED` → policy `VOID`, reservation released. Otherwise the
breach is the longest run of readings strictly above the threshold, broken by any gap
wider than `max_gap_seconds` and measured first reading to last. Below
`min_breach_minutes` → `NO_BREACH`, and the policy stays live with its reservation. Otherwise
severity and payout decile are computed and stored, and the claim becomes `VERIFIED`.

### 3. `adjudicate_claim`: consensus round 2, judged

1. `_hard_inconsistency`: a GPS track faster than 1200 km/h is rejected in code. No model runs.
2. `gl.vm.run_nondet_unsafe(leader, validator)`. The leader fetches Open-Meteo hourly
   temperature at the breach position and dates, builds a prompt from the deterministic
   features (max step per minute, flatline length, gap, speed, sampled series), the
   exclusions and the fenced customs snapshot. It gets back `{classification, excluded, reasoning}`.
3. The validator redoes the whole leader job. It must match `classification`, and it must match
   `excluded` when the classification is GENUINE. Reasoning is never compared, and no number is judged.
4. `GENUINE` and not excluded → pay `max_payout × payout_bps` (capped by capital), release
   the reservation, policy `PAID`. Otherwise the claim closes and the policy stays live.

GenVM will not start a nested non-deterministic block. Keeping the two rounds in separate
transactions also means an `UNDETERMINED` judgment retries without refetching IPFS.

## Merkle encoding

```
leaf = sha256(0x00 || json.dumps({"c","d","lat","lon","t"}, sort_keys, separators=(",",":")))
node = sha256(0x01 || left || right)
odd node → promoted unchanged
```

All values are integers (tenths of °C, 1e-5 degrees, unix seconds). The device is lowercase hex.
Domain separation stops an interior node posing as a leaf. Promotion instead of duplication
means `[a,b,c]` and `[a,b,c,c]` never share a root. The contract (Python), the agent (Node) and
the browser (WebCrypto) all assert `fixtures/merkle-vectors.json`. Those vectors come from a
fourth, standalone script, and CI re-generates them and fails on any diff.

## Payout

```
duration = min(1, breach_seconds / (full_breach_minutes·60))
depth    = min(1, peak_excess / full_excess)
severity = (duration + depth) / 2
payout   = max_payout × (min(9, ⌊severity·10⌋) + 1) / 10
```

## Solvency invariants (tested)

- `locked = Σ max_payout` over live policies. `buy_policy` requires `locked + reserve ≤ capital`.
- A reservation is released only on PAID / VOID / EXPIRED, never on a rejected claim.
- `withdraw` refuses to take capital below `locked`.
- The stub's balance debits on every emit and raises on overdraft, and the tests assert
  `balance == capital` after a payout.

## Testing layers and what each can't prove

| Layer | Proves | Cannot prove |
|---|---|---|
| `tests/direct` (7) | Real SDK storage/calldata round-trips, checksummed-address handling, validator agreement via `run_validator` | Time passing (the clock is fixed per deployment), balances |
| `tests/unit` (76) | The full state machine, backdating/grace windows, Merkle vectors, money math, balance conservation, validator votes | Storage encoding, real consensus |
| `agent/test` (15) | Shared vectors, finality classification, sensor physics, retrieval check | Chain behaviour |
| Live run (`agent/run.mjs`) | Real IPFS, real validators, real LLM, real transfer | — |

## GenLayer gotchas applied

- `Address` params are sent as `CalldataAddress`. A hex string silently fails decode while
  the tx reports ACCEPTED.
- Success means `FINALIZED` plus `leader_receipt[0].execution_result == "SUCCESS"`. `status` can be
  a numeric ordinal. Polling backs off from 4 s to a 20 s cap (Studio allows 5000 requests a day).
- `exec_prompt(response_format="json")` returns a parsed dict. Never `str()` it.
- EOAs are paid through a `@gl.evm.contract_interface` recipient, not `get_contract_at`.
- A rate-limited Studio response looks like a CORS error in the browser.
