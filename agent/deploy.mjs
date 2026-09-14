// Deploy GenSupply to Studio Network and verify the constructor really ran.
//
//   GENSUPPLY_PW=... node agent/deploy.mjs
//
// Env: DEPLOYER_KS (default verify-depositor), IPFS_GATEWAY, COMMIT_LAG, CLAIM_GRACE
import fs from "node:fs";
import path from "node:path";
import { ROOT, STATE_DIR, clientFor, keystoreAccount, loadEnv, read, saveJSON, waitFinal } from "./lib.mjs";

loadEnv();
const gateway = process.env.IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs/";
const lag = Number(process.env.COMMIT_LAG ?? 6 * 3600);
const grace = Number(process.env.CLAIM_GRACE ?? 86400);

const account = await keystoreAccount(process.env.DEPLOYER_KS ?? "verify-depositor");
const client = clientFor(account);
console.log("deployer", account.address);

const code = fs.readFileSync(path.join(ROOT, "contracts", "gensupply.py"), "utf8");
const hash = await client.deployContract({ code, args: [gateway, lag, grace] });
console.log("deploy tx", hash);
const tx = await waitFinal(client, hash, "deploy");
const contract = tx?.data?.contract_address ?? tx?.data?.contractAddress ?? tx?.contractAddress ?? tx?.recipient ?? tx?.to_address;
if (!contract) throw new Error(`no contract address in receipt: ${JSON.stringify(Object.keys(tx ?? {}))}`);

// "Deployed successfully" only means the tx landed. A view call proves the
// constructor ran and the code is live.
const config = await read(client, contract, "get_config");
console.log("CONTRACT", contract);
console.log(config);
saveJSON(path.join(STATE_DIR, "deployment.json"), {
  contract,
  deployer: account.address,
  tx: hash,
  network: "studionet",
  deployed_at: new Date().toISOString(),
  config,
});
