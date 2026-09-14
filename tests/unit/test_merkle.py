"""The contract's Merkle encoding against the shared fixture vectors.

fixtures/merkle-vectors.json is written by an independent reference script,
and the agent's JS suite asserts the same file. Agreement here plus agreement
there is what lets a device's root match the contract's rebuild on chain.
"""
import json
import pathlib

VECTORS = json.loads((pathlib.Path(__file__).resolve().parents[2] / "fixtures" / "merkle-vectors.json").read_text())


def test_every_vector_root_matches(h):
    for case in VECTORS["cases"]:
        assert h.module._merkle_root(case["readings"]) == case["root"], case["name"]


def test_canonical_leaf_bytes_match(h):
    case = next(c for c in VECTORS["cases"] if "canonical" in c)
    assert h.module._canonical_reading(case["readings"][0]).decode() == case["canonical"]


def test_order_matters(h):
    readings = VECTORS["cases"][3]["readings"]
    assert h.module._merkle_root(readings) != h.module._merkle_root(list(reversed(readings)))


def test_odd_node_is_promoted_not_duplicated(h):
    """Duplicating the last node would let [a,b,c] and [a,b,c,c] share a root."""
    three = VECTORS["cases"][2]["readings"]
    assert len(three) == 3
    assert h.module._merkle_root(three) != h.module._merkle_root(three + [three[-1]])


def test_empty_batch_has_no_root(h):
    assert h.module._merkle_root([]) == ""


def test_parse_rejects_float_temperatures(h):
    body = json.dumps(
        {"v": 1, "policy_id": 1, "seq": 1, "device": "0x" + "4a" * 20,
         "readings": [{"t": 1, "c": 4.5, "lat": 0, "lon": 0, "d": "0x" + "4a" * 20}]}
    ).encode()
    parsed = h.module._parse_batch_doc(body)
    assert parsed["valid"] is False


def test_parse_rejects_boolean_masquerading_as_int(h):
    body = json.dumps(
        {"v": 1, "policy_id": 1, "seq": 1, "device": "0x" + "4a" * 20,
         "readings": [{"t": True, "c": 40, "lat": 0, "lon": 0, "d": "0x" + "4a" * 20}]}
    ).encode()
    assert h.module._parse_batch_doc(body)["valid"] is False
