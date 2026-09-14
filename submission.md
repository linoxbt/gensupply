# GenSupply: GenLayer Portal submission

Copy each block below into the matching Portal field. Every block fits that field's
character limit.

---

## 01 · Identity

**Project name**

```
GenSupply
```

**Logo:** [`assets/logo.png`](assets/logo.png) (512 × 512 PNG)

**Primary tag:** Insurance / DeFi. If the list has no insurance tag, use DeFi with the
topic tags *Insurance* and *Oracles*, or the closest pair the dropdown offers.

---

## 02 · Project summary: One-liner (max 180)

```
Cold-chain cargo insurance where the sensor proves the breach: validators rebuild IPFS Merkle roots, check live weather and pay the claim under GenLayer consensus.
```

---

## 03 · Project overview: Description (max 1000)

```
GenSupply insures refrigerated shipments against temperature excursions and settles claims with no adjuster, oracle or resolver key. A policy binds a device key on the container's logger. The device agent pins sensor batches to IPFS and commits each batch's Merkle root on-chain, promptly, so readings can't be rewritten once a breach is known. When cargo warms past its threshold, the agent files the claim itself. First, validators fetch the raw IPFS bytes, rebuild every root inside the Intelligent Contract and compute the breach duration in code. A forged batch voids the policy. Next, each validator pulls live Open-Meteo weather for the route and judges whether the excursion is a real refrigeration failure, a probe fault or physically impossible, applying the policy's written exclusions. The payout is computed deterministically from how long and how far the cargo went over the threshold, so no validator ever proposes an amount. It's built for shippers, pharma and food logistics.
```

---

## 04 · Demo video

No video yet. Leave blank.

---

## 05 · How-to

**01 · Open the app**
Go to https://gensupply.netlify.app and click "Insure a shipment" (or open Cover from the menu).

**02 · Connect a wallet**
Click "Connect wallet" and connect on GenLayer Studio Network. The wallet needs a little Studio GEN: the demo premium is 0.002 GEN.

**03 · Choose the demo product**
On the Cover page, find Product #1 "Reefer Pharma 2-8C - demo (compressed time)" (pays above 8.0°C for more than 4 min) and click "Insure a shipment".

**04 · Buy cover**
Paste a device address. Your own wallet address is fine for this check. Keep the default shipment ref, origin, destination and 24-hour period, then click "Buy cover · 0.002 GEN" and approve. Wait until the button reports "Finalized on chain"; it only says so once the transaction is FINALIZED with a successful receipt.

**05 · Open your policy**
Open Shipments from the menu. Your policy is at the top with state ACTIVE and 0 batches. Click its number to open the policy page, which shows the product terms, the device and holder addresses, and an empty telemetry panel.

**06 · Check the capital reservation**
Open Pool. "Reserved" has gone up by exactly 0.02 GEN, the product's maximum payout, which is locked the moment cover is sold. "Premiums earned" has gone up by 0.002 GEN.

**07 · Read the settlement design**
Open "How it works" for the two consensus rounds: deterministic Merkle verification with strict_eq, then the credibility judgment with run_nondet. The contract source is contracts/gensupply.py in the GitHub repo.

**08 · Optional: run the device agent end to end**
Clone the repo, add PINATA_JWT to agent/.env, set GENSUPPLY_PW to a keystore password and run `node agent/run.mjs --scenario breach`. The agent buys a policy, commits batches, files the claim on breach and drives verification and adjudication. The policy page then shows the batches, the claim and the payout. The other scenarios are `tamper` (voided), `fault` (sensor fault) and `nominal` (no claim). This path hasn't been run end to end on the live contract yet.

---

## 06 · Review verification: expected outcome (max 500)

```
After step 04, Shipments lists a new ACTIVE policy with the next sequential ID, your wallet as holder and the entered device address. The Pool page shows Reserved up by exactly 0.02 GEN and Premiums up by 0.002 GEN (pool_stats on contract 0x349892c5FF0582Bc63daBe61eac6d7bfBC267aA8). Products #1 and #2 are both listed as OPEN on the Cover page.
```

**Contract link 1**

```
https://explorer-studio.genlayer.com/address/0x349892c5FF0582Bc63daBe61eac6d7bfBC267aA8
```

---

## 07 · Project links

**Website:** `https://gensupply.netlify.app`

**GitHub:** `https://github.com/linoxbt/gensupply`

**Evidence (GitHub Repository):** `https://github.com/linoxbt/gensupply`

---

## Reference for stewards

### Why it needs GenLayer

- **Trustless sensor verification:** validators rebuild each batch's Merkle root from the raw
  IPFS bytes inside consensus (`gl.eq_principle.strict_eq` over `gl.nondet.web.get`), so no single
  oracle vouches for the data.
- **Judgment code can't make:** whether an excursion is physically credible against real
  ambient weather is an LLM decision under consensus (`gl.vm.run_nondet_unsafe`). Validators
  compare it as an enum and never agree on a number.
- **Enforced settlement:** the same contract holds the premium pool and pays through an external
  message that executes only at finalization.

### What is live

| Item | Value |
|---|---|
| Contract (Studio Network) | `0x349892c5FF0582Bc63daBe61eac6d7bfBC267aA8` |
| Products | #1 demo (8 °C / 4 min, compressed time), #2 production terms (5 °C / 12 h) |
| Web app | https://gensupply.netlify.app |
| Tests | 76 in-process + 7 GenVM direct-mode + 15 agent; GenVM lint clean; CI green |

### Brief → build

| Brief item | Built |
|---|---|
| Supply-chain agent | `agent/run.mjs`: simulated reefer (4 scenarios), Pinata pinning, batch commits, local breach rule, auto-claim, drives settlement |
| Policy NFT (ERC-1155) | Native transferable policy records with a `balance_of` view (no Solidity) |
| Claim contract | `file_claim` → `verify_telemetry` → `adjudicate_claim`, plus a share-based capital pool |
| Adjudication wrapper | Not needed: adjudication is the contract's own consensus round |
| Proof of sensor integrity | Device-signed commits + a domain-separated Merkle tree, with shared test vectors across Python, Node and the browser |
| Dynamic payout (upgrade) | Payout decile computed from verified duration × depth |
| Real-world data (upgrade) | Live Open-Meteo ambient temperature in every adjudication |
