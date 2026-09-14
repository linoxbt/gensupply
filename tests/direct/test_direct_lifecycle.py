"""The same lifecycle as tests/unit, through the real SDK's storage and calldata."""
import json

from helpers import GEN, hexof, mock_weather, pin, readings


def commit(contract, vm, device, pol, seq, rs, body=None):
    cid, root = pin(vm, pol, seq, device, rs, body)
    vm.sender = device
    contract.commit_batch(pol, seq, cid, root, rs[0]["t"], rs[-1]["t"], len(rs))
    return cid, root


def test_views_after_purchase(contract, policy, direct_bob, direct_charlie):
    p = contract.get_policy(policy)
    assert p["state"] == "ACTIVE"
    assert p["holder"].lower() == hexof(direct_bob).lower()
    assert p["device"].lower() == hexof(direct_charlie).lower()
    stats = contract.pool_stats()
    assert stats["capital_atto"] == str(51 * GEN)
    assert stats["locked_atto"] == str(10 * GEN)
    assert contract.balance_of(direct_bob, policy) == 1


def test_commit_roundtrips_through_storage(contract, direct_vm, policy, direct_charlie):
    rs = readings(direct_charlie, [40, 41, 40])
    cid, root = commit(contract, direct_vm, direct_charlie, policy, 1, rs)
    batch = contract.get_batch(policy, 1)
    assert batch["cid"] == cid and batch["merkle_root"] == root
    assert len(contract.list_batches(policy)) == 1


def test_non_device_commit_reverts(contract, direct_vm, policy, direct_bob, direct_charlie):
    rs = readings(direct_charlie, [40, 41])
    cid, root = pin(direct_vm, policy, 1, direct_charlie, rs)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the bound device"):
        contract.commit_batch(policy, 1, cid, root, rs[0]["t"], rs[-1]["t"], 2)


def test_checksummed_device_address_verifies(contract, direct_vm, policy, direct_charlie):
    """The real SDK returns EIP-55 addresses; the contract must compare lowercase."""
    rs = readings(direct_charlie, [40, 60, 62, 64, 66, 40])
    commit(contract, direct_vm, direct_charlie, policy, 1, rs)
    claim = contract.file_claim(policy, 1, 1)
    assert contract.verify_telemetry(claim) == "VERIFIED"


def test_breach_verified_and_adjudicated(contract, direct_vm, policy, direct_charlie):
    rs = readings(direct_charlie, [40, 60, 70, 80, 85, 90, 90, 88, 86, 84, 82, 80, 78])
    commit(contract, direct_vm, direct_charlie, policy, 1, rs)
    direct_vm.sender = direct_charlie
    claim = contract.file_claim(policy, 1, 1)

    assert contract.verify_telemetry(claim) == "VERIFIED"
    c = contract.get_claim(claim)
    assert c["integrity"]["ok"] is True
    assert c["breach_minutes"] == "3"  # 11 readings above x 20s = 220s
    assert c["peak_excess_c_x10"] == "40"

    mock_weather(direct_vm)
    direct_vm.mock_llm(r".*cold-chain loss assessor.*", json.dumps(
        {"classification": "SENSOR_FAULT", "excluded": False, "reasoning": "a b"}
    ))
    assert contract.adjudicate_claim(claim) == "SENSOR_FAULT"
    assert contract.get_policy(policy)["state"] == "ACTIVE"
    assert contract.get_claim(claim)["classification"] == "SENSOR_FAULT"


def test_tampered_batch_voids_policy(contract, direct_vm, policy, direct_charlie):
    honest = readings(direct_charlie, [40, 60, 70])
    forged = [dict(r, c=r["c"] + 20) for r in honest]
    body = json.dumps({"v": 1, "policy_id": int(policy), "seq": 1, "device": hexof(direct_charlie), "readings": forged}).encode()
    commit(contract, direct_vm, direct_charlie, policy, 1, honest, body=body)
    direct_vm.sender = direct_charlie
    claim = contract.file_claim(policy, 1, 1)
    assert contract.verify_telemetry(claim) == "TAMPERED"
    assert contract.get_policy(policy)["state"] == "VOID"
    assert contract.pool_stats()["locked_atto"] == "0"


def test_validator_agrees_with_matching_leader(contract, direct_vm, policy, direct_charlie):
    rs = readings(direct_charlie, [40, 60, 70, 80, 85, 90, 90, 88, 86, 84, 82, 80, 78])
    commit(contract, direct_vm, direct_charlie, policy, 1, rs)
    direct_vm.sender = direct_charlie
    claim = contract.file_claim(policy, 1, 1)
    contract.verify_telemetry(claim)
    mock_weather(direct_vm)
    direct_vm.mock_llm(r".*cold-chain loss assessor.*", json.dumps(
        {"classification": "INCONSISTENT", "excluded": False, "reasoning": "x"}
    ))
    contract.adjudicate_claim(claim)
    assert direct_vm.run_validator() is True
