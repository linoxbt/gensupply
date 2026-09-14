"""Fixtures for the in-process suite. See glstub.py for what this proves."""
import base64
import datetime
import hashlib
import importlib.util
import json
import pathlib
import sys

import pytest

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "fixtures"))
import glstub  # noqa: E402
import make_merkle_vectors as reference  # noqa: E402

CONTRACT_PATH = ROOT / "contracts" / "gensupply.py"

GEN = 10**18
NOW = datetime.datetime(2026, 3, 1, tzinfo=datetime.timezone.utc)
NOW_TS = int(NOW.timestamp())
GATEWAY = "https://gateway.test/ipfs/"
WEATHER_PREFIX = "https://api.open-meteo.com/v1/forecast"
CUSTOMS_HOST = "customs.example.gov"
EXCLUSIONS = (
    "Excursions caused by a customs hold or inspection outside the carrier's "
    "control are excluded."
)

OWNER = glstub.Address("0x" + "10" * 20)
LP = glstub.Address("0x" + "20" * 20)
HOLDER = glstub.Address("0x" + "30" * 20)
DEVICE = glstub.Address("0x" + "4a" * 20)
STRANGER = glstub.Address("0x" + "50" * 20)
BUYER2 = glstub.Address("0x" + "60" * 20)

LAG = 6 * 3600
GRACE = 3 * 86400


def _load_contract_module():
    spec = importlib.util.spec_from_file_location("gensupply_contract", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_cid(body: bytes) -> str:
    """CIDv1-shaped (base32, 'b' multibase prefix). Only the shape matters to
    the contract: integrity comes from the Merkle root, not the CID."""
    return "bafkrei" + base64.b32encode(hashlib.sha256(body).digest()).decode().lower().rstrip("=")


class Harness:
    def __init__(self):
        self.gl = glstub.install()
        self.module = _load_contract_module()
        self.now = NOW_TS
        self._set_clock()
        self.acting_as(OWNER)
        self.contract = self.module.GenSupply(GATEWAY, LAG, GRACE)
        self.next_t = NOW_TS + 60

    # -- host controls -------------------------------------------------
    def _set_clock(self):
        stamp = datetime.datetime.fromtimestamp(self.now, tz=datetime.timezone.utc)
        self.gl.message_raw["datetime"] = stamp.strftime("%Y-%m-%dT%H:%M:%SZ")

    def warp_to(self, ts: int) -> None:
        assert ts >= self.now, "time only moves forward"
        self.now = ts
        self._set_clock()

    def warp(self, seconds: int) -> None:
        self.warp_to(self.now + seconds)

    def acting_as(self, sender, value: int = 0) -> None:
        self.gl.message.sender_address = sender
        self.gl.message.value = glstub.u256(value)
        # Attached value is credited before the call runs, as on chain.
        self.gl.balance += int(value)

    def paid_to(self, address) -> int:
        return sum(t["value"] for t in self.gl.transfers if t["to"] == address)

    # -- setup ---------------------------------------------------------
    def product(self, **kw) -> int:
        self.acting_as(OWNER)
        return int(
            self.contract.create_product(
                kw.pop("name", "Reefer cover 5C"),
                kw.pop("threshold_c_x10", 50),
                kw.pop("min_breach_minutes", 60),
                kw.pop("full_breach_minutes", 240),
                kw.pop("full_excess_c_x10", 50),
                kw.pop("max_gap_seconds", 900),
                kw.pop("max_payout_atto", 10 * GEN),
                kw.pop("premium_atto", 1 * GEN),
                kw.pop("exclusions", EXCLUSIONS),
                kw.pop("customs_hosts", [CUSTOMS_HOST]),
            )
        )

    def fund(self, amount=50 * GEN, lp=LP) -> int:
        self.acting_as(lp, amount)
        return int(self.contract.deposit())

    def buy(self, pid, holder=HOLDER, device=DEVICE, hours=48, value=None) -> int:
        premium = int(self.contract.get_product(pid)["premium_atto"])
        self.acting_as(holder, premium if value is None else value)
        return int(self.contract.buy_policy(pid, device, "SHIP-001", "Rotterdam", "Lagos", hours))

    def setup_policy(self, **product_kw):
        pid = self.product(**product_kw)
        self.fund()
        return pid, self.buy(pid)

    # -- telemetry -----------------------------------------------------
    def series(self, temps, step=300, device=DEVICE, lat=5190000, lon=447000, dlat=40, dlon=-60, start=None):
        t = self.next_t if start is None else start
        out = []
        for i, c in enumerate(temps):
            out.append({"t": t, "c": c, "lat": lat + dlat * i, "lon": lon + dlon * i, "d": device.as_hex.lower()})
            t += step
        self.next_t = t
        return out

    def doc(self, policy_id, seq, readings, device=DEVICE) -> bytes:
        return json.dumps(
            {"v": 1, "policy_id": policy_id, "seq": seq, "device": device.as_hex, "readings": readings}
        ).encode()

    def commit(self, policy_id, readings, seq=None, body=None, root=None, sender=DEVICE, status=200):
        """Pin a batch at the fake gateway and commit it from the device.

        The root is computed by the standalone reference implementation, never
        by the contract, so a Merkle bug in the contract cannot agree with itself.
        """
        if seq is None:
            seq = int(self.contract.get_policy(policy_id)["batch_count"]) + 1
        body = self.doc(policy_id, seq, readings) if body is None else body
        cid = fake_cid(body)
        self.gl.nondet.web.pages[GATEWAY + cid] = (status, body)
        root = reference.root(readings) if root is None else root
        if self.now < readings[-1]["t"]:
            self.warp_to(readings[-1]["t"] + 30)
        self.acting_as(sender)
        self.contract.commit_batch(policy_id, seq, cid, root, readings[0]["t"], readings[-1]["t"], len(readings))
        return cid

    def mock_weather(self, low_c=24.0, high_c=31.0, status=200):
        start = datetime.datetime(2026, 2, 28, tzinfo=datetime.timezone.utc)
        times, temps = [], []
        for h in range(24 * 6):
            stamp = start + datetime.timedelta(hours=h)
            times.append(stamp.strftime("%Y-%m-%dT%H:%M"))
            temps.append(low_c + (high_c - low_c) * ((h % 24) / 23))
        body = json.dumps({"hourly": {"time": times, "temperature_2m": temps}}).encode()
        self.gl.nondet.web.prefixes = [p for p in self.gl.nondet.web.prefixes if p[0] != WEATHER_PREFIX]
        self.gl.nondet.web.prefixes.append((WEATHER_PREFIX, (status, body)))

    def queue_llm(self, classification="GENUINE", excluded=False, reasoning="Gradual rise toward ambient."):
        self.gl.nondet.responses.append(
            json.dumps({"classification": classification, "excluded": excluded, "reasoning": reasoning})
        )

    # -- claims --------------------------------------------------------
    def file(self, policy_id, first=1, last=None, by=DEVICE) -> int:
        if last is None:
            last = int(self.contract.get_policy(policy_id)["batch_count"])
        self.acting_as(by)
        return int(self.contract.file_claim(policy_id, first, last))

    def verify(self, claim_id) -> str:
        self.acting_as(STRANGER)
        return self.contract.verify_telemetry(claim_id)

    def adjudicate(self, claim_id) -> str:
        self.acting_as(STRANGER)
        return self.contract.adjudicate_claim(claim_id)

    # -- canned shipments ----------------------------------------------
    NOMINAL = [40] * 12
    RISING = [45, 55, 62, 70, 76, 80, 83, 85, 86, 86, 87, 87]
    HOT = [88, 88, 89, 89, 90, 90, 90, 89, 89, 88, 88, 88]

    def breach_shipment(self, policy_id):
        """Three contiguous 5-minute batches; breach runs from batch 2 reading 2 to the end.

        23 readings above 5.0C at 300s spacing = 6600s (110 min), peak 9.0C (40 over).
        """
        self.commit(policy_id, self.series(self.NOMINAL))
        self.commit(policy_id, self.series(self.RISING))
        self.commit(policy_id, self.series(self.HOT))


