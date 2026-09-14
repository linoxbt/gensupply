// Pinning via Pinata, and a retrieval check through the same gateway the
// contract's validators will use. Committing a CID validators cannot resolve
// would only fail later, inside a consensus round, so it is refused here.
import { backoffMs } from "./txstatus.mjs";

const PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export async function pinBatch(jwt, name, body) {
  if (!jwt) throw new Error("PINATA_JWT is not set (agent/.env)");
  const form = new FormData();
  // pinFileToIPFS stores these exact bytes; pinJSONToIPFS would re-serialise.
  form.append("file", new Blob([body], { type: "application/json" }), `${name}.json`);
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  form.append("pinataMetadata", JSON.stringify({ name }));
  const res = await fetch(PIN_URL, { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${text.slice(0, 300)}`);
  const cid = JSON.parse(text).IpfsHash;
  if (!cid) throw new Error(`Pinata returned no CID: ${text.slice(0, 300)}`);
  return cid;
}

export async function confirmRetrievable(gateway, cid, expectedBody, { attempts = 8, fetchImpl = fetch, sleep } = {}) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = "";
  for (let a = 0; a < attempts; a++) {
    try {
      const res = await fetchImpl(gateway + cid, { headers: { Accept: "application/json" } });
      const text = await res.text();
      if (res.ok && text === expectedBody) return true;
      last = res.ok ? "body differs from what was pinned" : `HTTP ${res.status}`;
    } catch (err) {
      last = String(err?.message ?? err);
    }
    await wait(backoffMs(a));
  }
  throw new Error(`CID ${cid} not retrievable via ${gateway}: ${last}`);
}
