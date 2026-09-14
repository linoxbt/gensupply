# GenSupply: submission

**One line:** cold-chain cargo insurance where the sensor's device agent commits its own
Merkle-rooted telemetry, detects a breach, files the claim, and GenLayer consensus verifies
the proof and pays, with no human or oracle in the loop.

## Why it needs GenLayer

- **Trustless sensor verification.** Validators fetch the raw IPFS bytes and rebuild every
  batch's Merkle root inside the contract (`strict_eq`). No single oracle vouches for the data.
- **Judgment where code can't reach.** Whether an excursion is a real refrigeration failure,
  a probe glitch, or physically impossible given the actual weather on the route is an
  LLM call under consensus, compared as an enum.
- **Immediate, enforceable settlement.** The same contract holds the premium pool and emits
  the payout at finalization. The agent is the product: it acts end to end.

## Brief → what was built

| Brief item | Built |
|---|---|
| Supply-chain agent prototype | `agent/run.mjs`: simulated reefer (4 scenarios), IPFS pinning via Pinata, batch commits, local breach rule, auto-claim, drives settlement |
| Policy NFT (ERC-1155) | Native policy records: `holder`, `transfer_policy`, `balance_of`, terms bound per product |
| Claim contract | `file_claim`, `verify_telemetry`, `adjudicate_claim`, plus premium pool with share-based LPs |
| GenLayer adjudication wrapper | Not needed. Adjudication *is* the contract's consensus round |
| Proof of sensor integrity | Device-signed `commit_batch` + domain-separated Merkle tree, shared vectors across Python/Node/browser |
| Demo flow | `--scenario breach` → PAID, `tamper` → TAMPERED/VOID, `fault` → SENSOR_FAULT, `nominal` → no claim |

## Winner-level upgrades delivered

- **Dynamic claim scaling:** payout decile from verified duration × depth, computed
  deterministically so consensus is exact.
- **Real-world data:** every adjudication pulls live Open-Meteo ambient temperature for the
  breach location and time. The simulated failure is itself anchored to live weather.
- **Documentary evidence:** optional customs document from underwriter-approved hosts,
  snapshotted in consensus and applied against written exclusions.
- **Browser re-verification:** the dApp fetches each CID and rebuilds roots with WebCrypto.

## Links

- Contract (Studio Network): `0x349892c5FF0582Bc63daBe61eac6d7bfBC267aA8`
- Source: https://github.com/linoxbt/gensupply
