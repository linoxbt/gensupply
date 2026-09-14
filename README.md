# GenSupply

**Cold-chain cargo cover that settles itself from the sensor's own data, on GenLayer.**

A refrigerated container's logger holds a device key. It pins its readings to IPFS every few
minutes and commits each batch's Merkle root on-chain. When the cargo breaches its threshold, the
agent files the claim itself. Validators then rebuild every root from the raw IPFS bytes, compute the
breach, check the excursion against the real weather on the route, and pay the holder, all inside
GenLayer consensus. No adjuster, no oracle operator, no resolver key.

- **Contract (Studio Network):** `0x349892c5FF0582Bc63daBe61eac6d7bfBC267aA8`
- **Design:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## What is decided how

| Question | Mechanism |
|---|---|
| Did *this device* record *these* readings? | The tx signature on `commit_batch` + a Merkle root rebuilt in-contract from IPFS (`strict_eq`) |
| Were they rewritten after the fact? | The commit-lag guard. Any mismatched root voids the policy |
| How long and how far above threshold? | Deterministic code, with data gaps breaking the run |
| Is the excursion physically real? | LLM judgment under consensus: `GENUINE / SENSOR_FAULT / INCONSISTENT`, compared as an enum against Open-Meteo ambient data |
| Does a written exclusion apply? | The same round, over an approved-host customs snapshot fenced as untrusted |
| How much is paid? | Deterministic deciles of duration × depth. Never judged |

## Repository

```
contracts/gensupply.py   the Intelligent Contract (single file)
agent/                   device agent + deploy/setup scripts (Node, genlayer-js)
frontend/                Next.js dApp (policy telemetry re-verified in the browser)
fixtures/                shared Merkle test vectors + generator
tests/direct, tests/unit contract suites
```

## Run it

```bash
# contract
pip install genlayer-py genlayer-test pytest
genvm-lint check contracts/gensupply.py
python -m pytest -q                       # 83 tests

# agent
node --test agent/test/*.test.mjs         # 15 tests
echo "PINATA_JWT=..." > agent/.env
export GENSUPPLY_PW=...                   # keystore password
node agent/deploy.mjs                     # optional: your own deployment
node agent/setup.mjs                      # products + pool capital
node agent/run.mjs --scenario breach      # or nominal | fault | tamper

# frontend
cd frontend && npm ci
NEXT_PUBLIC_GENSUPPLY_ADDRESS=0x... NEXT_PUBLIC_REOWN_PROJECT_ID=... npm run dev
```

The agent's scenarios are the demo:

| Scenario | What the sensor does | Expected outcome |
|---|---|---|
| `breach` | The compressor fails and the hold warms toward real ambient + solar gain | `PAID`, scaled by severity |
| `fault` | The probe jumps to 85 °C instantly and flatlines | `SENSOR_FAULT`, cover stays live |
| `tamper` | The uploader pins +6 °C doctored readings under the honest root | `TAMPERED`, policy void |
| `nominal` | The reefer holds setpoint | No claim filed |

## Demo products

Product #1 compresses time (4-minute minimum breach) so a full run fits in a judging slot. Product #2 is
the real-world term from the brief (5 °C for 12 h). Both run the identical contract logic.

## License

MIT
