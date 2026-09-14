"""Claim lifecycle: verification, credibility round, payout and every rejection path."""
import json

import pytest

from harness import (
    BUYER2, CUSTOMS_HOST, DEVICE, GATEWAY, GEN, GRACE, HOLDER, LP, STRANGER, fake_cid, reference,
)


def breached(h, **product_kw):
    pid, pol = h.setup_policy(**product_kw)
    h.breach_shipment(pol)
    claim = h.file(pol)
    return pid, pol, claim


def test_breach_pays_holder_the_decile_payout(h):
    _, pol, claim = breached(h)
    balance_before = h.gl.balance
    assert h.verify(claim) == "VERIFIED"
    c = h.contract.get_claim(claim)
    assert c["breach_minutes"] == "110"
    assert c["peak_excess_c_x10"] == "40"
    # duration 6600/14400 -> 4583 bps, depth 40/50 -> 8000 bps, mean 6291 -> decile 6 -> 70%
    assert c["severity_bps"] == "6291"
    assert c["payout_bps"] == "7000"

    h.mock_weather()
    h.queue_llm("GENUINE")
    assert h.adjudicate(claim) == "PAID"

    c = h.contract.get_claim(claim)
    assert c["outcome"] == "PAID" and c["state"] == "CLOSED"
    assert c["payout_atto"] == str(7 * GEN)
    assert h.paid_to(HOLDER) == 7 * GEN
    assert h.gl.balance == balance_before - 7 * GEN
    p = h.contract.get_policy(pol)
    assert p["state"] == "PAID" and p["payout_atto"] == str(7 * GEN)
    stats = h.contract.pool_stats()
    assert stats["locked_atto"] == "0"
    assert stats["capital_atto"] == str(50 * GEN + 1 * GEN - 7 * GEN)
    assert stats["payouts_atto"] == str(7 * GEN)


def test_contract_never_holds_less_than_its_capital(h):
    """Balance conservation: every wei of accounted capital is really held."""
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather()
    h.queue_llm("GENUINE")
    h.adjudicate(claim)
    assert h.gl.balance == int(h.contract.pool_stats()["capital_atto"])


def test_verification_reads_every_batch_through_the_gateway(h):
    _, pol, claim = breached(h)
    h.verify(claim)
    gateway_hits = [u for u in h.gl.nondet.web.fetches if u.startswith(GATEWAY)]
    assert len(gateway_hits) == 3
    integrity = h.contract.get_claim(claim)["integrity"]
    assert integrity["ok"] is True
    assert all(b["recomputed_root"] == b["committed_root"] for b in integrity["batches"])


def test_payout_goes_to_whoever_holds_the_policy_at_settlement(h):
    _, pol = h.setup_policy()
    h.breach_shipment(pol)
    h.acting_as(HOLDER)
    h.contract.transfer_policy(pol, BUYER2)
    claim = h.file(pol)
    h.verify(claim)
    h.mock_weather()
    h.queue_llm("GENUINE")
    h.adjudicate(claim)
    assert h.paid_to(BUYER2) == 7 * GEN
    assert h.paid_to(HOLDER) == 0


def test_short_excursion_is_no_breach_and_cover_stays_reserved(h):
    _, pol = h.setup_policy()
    # Three readings above, 5 minutes apart. Breach time runs first-to-last
    # reading above threshold - 10 minutes - never crediting unobserved time.
    h.commit(pol, h.series([40, 60, 62, 61, 40, 40]))
    claim = h.file(pol)
    assert h.verify(claim) == "NO_BREACH"
    assert h.contract.get_claim(claim)["breach_minutes"] == "10"
    p = h.contract.get_policy(pol)
    assert p["state"] == "ACTIVE" and p["open_claim_id"] == "0"
    assert h.contract.pool_stats()["locked_atto"] == str(10 * GEN)
    assert h.gl.transfers == []


def test_rejected_policy_can_claim_again_later(h):
    _, pol = h.setup_policy()
    h.commit(pol, h.series([40, 60, 40]))
    assert h.verify(h.file(pol)) == "NO_BREACH"
    h.commit(pol, h.series(h.RISING))
    h.commit(pol, h.series(h.HOT))
    claim = h.file(pol, first=2, last=3)
    assert h.verify(claim) == "VERIFIED"


def test_data_gap_breaks_the_breach_run(h):
    """Two hot stretches separated by a silent logger are two short breaches, not one long one."""
    _, pol = h.setup_policy()
    h.commit(pol, h.series([80] * 8))  # 35 min
    h.next_t += 2 * 3600
    h.commit(pol, h.series([80] * 8))  # 35 min, after a 2h gap
    claim = h.file(pol)
    assert h.verify(claim) == "NO_BREACH"
    assert h.contract.get_claim(claim)["breach_minutes"] == "35"


def test_tampered_reading_voids_the_policy(h):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    honest = h.series(h.RISING)
    forged = [dict(r, c=r["c"] + 30) for r in honest]
    h.commit(pol, honest, body=h.doc(pol, 2, forged))  # root of honest, bytes of forged
    claim = h.file(pol)
    assert h.verify(claim) == "TAMPERED"
    c = h.contract.get_claim(claim)
    assert c["outcome"] == "TAMPERED" and c["state"] == "CLOSED"
    bad = [b for b in c["integrity"]["batches"] if not b["ok"]]
    assert [b["seq"] for b in bad] == [2]
    assert "merkle root" in bad[0]["why"]
    assert h.contract.get_policy(pol)["state"] == "VOID"
    assert h.contract.pool_stats()["locked_atto"] == "0"
    assert h.gl.transfers == []


def test_garbage_behind_the_cid_is_tampering(h):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    h.commit(pol, readings, body=b"<html>not telemetry</html>")
    assert h.verify(h.file(pol)) == "TAMPERED"


def test_document_for_another_policy_is_tampering(h):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    h.commit(pol, readings, body=h.doc(pol + 7, 1, readings))
    claim = h.file(pol)
    assert h.verify(claim) == "TAMPERED"
    assert "different policy" in h.contract.get_claim(claim)["integrity"]["batches"][0]["why"]


def test_reading_from_another_device_is_tampering(h):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL, device=STRANGER)
    h.commit(pol, readings)
    assert h.verify(h.file(pol)) == "TAMPERED"


def test_gateway_outage_reverts_and_leaves_claim_filed(h, UserError):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL), status=503)
    claim = h.file(pol)
    with pytest.raises(UserError, match=r"\[TRANSIENT\]"):
        h.verify(claim)
    assert h.contract.get_claim(claim)["state"] == "FILED"


def test_sensor_fault_rejects_but_keeps_cover(h):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather()
    h.queue_llm("SENSOR_FAULT", reasoning="Jumps of several degrees between readings.")
    assert h.adjudicate(claim) == "SENSOR_FAULT"
    assert h.contract.get_policy(pol)["state"] == "ACTIVE"
    assert h.contract.pool_stats()["locked_atto"] == str(10 * GEN)
    assert h.gl.transfers == []


def test_impossible_gps_track_is_rejected_without_a_model(h):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    h.commit(pol, h.series(h.RISING, dlat=200000))  # ~2 degrees of latitude per 5 minutes
    h.commit(pol, h.series(h.HOT))
    claim = h.file(pol)
    h.verify(claim)
    assert h.adjudicate(claim) == "INCONSISTENT"  # nothing queued: exec_prompt would raise
    assert h.gl.nondet.prompts == []
    assert "km/h" in h.contract.get_claim(claim)["reasoning"]


def test_customs_exclusion_blocks_payout(h):
    _, pol, claim = breached(h)
    url = f"https://{CUSTOMS_HOST}/release/SHIP-001"
    h.gl.nondet.web.pages[url] = (200, b"<html><script>x()</script><h1>Held</h1><p>Container held for inspection 6h.</p></html>")
    h.acting_as(HOLDER)
    snapshot = h.contract.attach_customs_doc(claim, url)
    assert snapshot == "Held Container held for inspection 6h."
    h.verify(claim)
    h.mock_weather()
    h.queue_llm("GENUINE", excluded=True)
    assert h.adjudicate(claim) == "EXCLUDED"
    assert "<<<BEGIN_UNTRUSTED_DOCUMENT>>>" in h.gl.nondet.prompts[0]
    assert "Container held for inspection" in h.gl.nondet.prompts[0]
    assert h.gl.transfers == []


def test_exclusion_flag_is_ignored_unless_genuine(h):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather()
    h.queue_llm("SENSOR_FAULT", excluded=True)
    h.adjudicate(claim)
    assert h.contract.get_claim(claim)["excluded"] == "false"


def test_customs_doc_from_unapproved_host_is_refused(h, UserError):
    _, pol, claim = breached(h)
    h.acting_as(HOLDER)
    with pytest.raises(UserError, match="not admissible"):
        h.contract.attach_customs_doc(claim, "https://attacker.example.com/doc")


def test_customs_doc_only_by_holder_or_filer(h, UserError):
    _, pol, claim = breached(h)
    h.acting_as(STRANGER)
    with pytest.raises(UserError, match="holder or filer"):
        h.contract.attach_customs_doc(claim, f"https://{CUSTOMS_HOST}/x")


def test_prompt_carries_ambient_weather_and_features(h):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather(low_c=18.0, high_c=22.0)
    h.queue_llm("GENUINE")
    h.adjudicate(claim)
    prompt = h.gl.nondet.prompts[0]
    assert '"available": true' in prompt
    assert "110 minutes above threshold" in prompt
    assert "max_step_x10_per_min" in prompt


def test_weather_outage_reverts_the_round(h, UserError):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather(status=503)
    with pytest.raises(UserError, match=r"\[TRANSIENT\]"):
        h.adjudicate(claim)
    assert h.contract.get_claim(claim)["state"] == "VERIFIED"


def test_unknown_classification_is_an_llm_error(h, UserError):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather()
    h.queue_llm("PROBABLY_FINE")
    with pytest.raises(UserError, match=r"\[LLM_ERROR\]"):
        h.adjudicate(claim)


def test_validator_agrees_on_matching_classification(h):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather()
    h.gl.vm.validate = True
    h.queue_llm("GENUINE", reasoning="leader words")
    h.queue_llm("GENUINE", reasoning="different validator words")
    h.adjudicate(claim)
    assert h.gl.vm.votes == [True]


def test_validator_disagrees_on_different_classification(h):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather()
    h.gl.vm.validate = True
    h.queue_llm("GENUINE")
    h.queue_llm("SENSOR_FAULT")
    h.adjudicate(claim)
    assert h.gl.vm.votes == [False]


def test_validator_disagrees_on_exclusion_when_genuine(h):
    _, pol, claim = breached(h)
    h.verify(claim)
    h.mock_weather()
    h.gl.vm.validate = True
    h.queue_llm("GENUINE", excluded=False)
    h.queue_llm("GENUINE", excluded=True)
    h.adjudicate(claim)
    assert h.gl.vm.votes == [False]


def test_only_device_or_holder_may_file(h, UserError):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    with pytest.raises(UserError, match="device or holder"):
        h.file(pol, by=STRANGER)
    assert h.file(pol, by=HOLDER) == 1


def test_claim_range_must_be_committed(h, UserError):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    with pytest.raises(UserError, match="not committed"):
        h.file(pol, first=1, last=2)


def test_one_open_claim_at_a_time(h, UserError):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    h.file(pol)
    with pytest.raises(UserError, match="CLAIMING"):
        h.file(pol)


def test_claim_cap_per_policy(h, UserError):
    _, pol = h.setup_policy()
    for _ in range(3):
        h.commit(pol, h.series([40, 40]))
        seq = int(h.contract.get_policy(pol)["batch_count"])
        assert h.verify(h.file(pol, first=seq, last=seq)) == "NO_BREACH"
    h.commit(pol, h.series([40, 40]))
    with pytest.raises(UserError, match="used all its claims"):
        h.file(pol, first=4, last=4)


def test_claim_period_ends_after_grace(h, UserError):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    expires = int(h.contract.get_policy(pol)["expires_at"])
    h.warp_to(expires + GRACE)
    with pytest.raises(UserError, match="Claim period"):
        h.file(pol)


def test_cannot_adjudicate_before_verification(h, UserError):
    _, pol, claim = breached(h)
    with pytest.raises(UserError, match="not VERIFIED"):
        h.adjudicate(claim)


def test_cannot_verify_twice(h, UserError):
    _, pol, claim = breached(h)
    h.verify(claim)
    with pytest.raises(UserError, match="not FILED"):
        h.verify(claim)


def test_payout_capped_by_capital(h):
    """A drained pool pays what it has rather than reverting the whole round."""
    _, pol, claim = breached(h)
    h.verify(claim)
    h.contract.capital_atto = h.module.u256(3 * GEN)  # simulate losses elsewhere
    h.mock_weather()
    h.queue_llm("GENUINE")
    h.adjudicate(claim)
    assert h.paid_to(HOLDER) == 3 * GEN
