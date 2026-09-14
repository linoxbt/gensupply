"""Direct-mode fixtures: the real GenVM SDK, storage encoding and calldata.

The direct VM's clock is fixed for the life of a deployment, so everything
here happens inside the 5-minute future-skew window after purchase. Time- and
balance-shaped behaviour lives in tests/unit.
"""
import base64
import hashlib
import json
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "fixtures"))
import make_merkle_vectors as reference  # noqa: E402

GEN = 10**18
NOW_ISO = "2026-03-01T00:00:00Z"
NOW_TS = 1772323200
GATEWAY = "https://gateway.test/ipfs/"


def hexof(account) -> str:
    return "0x" + account.hex() if isinstance(account, (bytes, bytearray)) else str(account)


def fake_cid(body: bytes) -> str:
    return "bafkrei" + base64.b32encode(hashlib.sha256(body).digest()).decode().lower().rstrip("=")


def readings(device, temps, start=NOW_TS + 10, step=20):
    return [
        {"t": start + step * i, "c": c, "lat": 5190000 + 5 * i, "lon": 447000 - 5 * i, "d": hexof(device).lower()}
        for i, c in enumerate(temps)
    ]


def pin(vm, policy_id, seq, device, rs, body=None):
    body = body or json.dumps(
        {"v": 1, "policy_id": policy_id, "seq": seq, "device": hexof(device), "readings": rs}
    ).encode()
    cid = fake_cid(body)
    vm.mock_web(rf"gateway\.test/ipfs/{cid}$", {"status": 200, "body": body.decode()})
    return cid, reference.root(rs)


def mock_weather(vm):
    times = [f"2026-03-01T{h:02d}:00" for h in range(24)]
    temps = [22.0 + h % 5 for h in range(24)]
    vm.mock_web(r"api\.open-meteo\.com", {"status": 200, "body": json.dumps({"hourly": {"time": times, "temperature_2m": temps}})})


