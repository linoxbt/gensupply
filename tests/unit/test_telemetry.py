"""commit_batch: the device's signed commitment and every guard around it."""
import pytest

from harness import DEVICE, GATEWAY, HOLDER, LAG, STRANGER, fake_cid, reference


def test_device_commit_is_recorded(h):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    cid = h.commit(pol, readings)
    batch = h.contract.get_batch(pol, 1)
    assert batch["cid"] == cid
    assert batch["merkle_root"] == reference.root(readings)
    assert batch["count"] == "12"
    assert h.contract.get_policy(pol)["batch_count"] == "1"


def test_only_the_bound_device_may_commit(h, UserError):
    _, pol = h.setup_policy()
    for sender in (HOLDER, STRANGER):
        with pytest.raises(UserError, match="Only the bound device"):
            h.commit(pol, h.series(h.NOMINAL), sender=sender)


def test_seq_must_be_next(h, UserError):
    _, pol = h.setup_policy()
    with pytest.raises(UserError, match="Expected batch seq 1"):
        h.commit(pol, h.series(h.NOMINAL), seq=2)


def test_root_prefix_is_accepted_and_normalised(h):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    h.commit(pol, readings, root="0x" + reference.root(readings).upper())
    assert h.contract.get_batch(pol, 1)["merkle_root"] == reference.root(readings)


@pytest.mark.parametrize("cid", ["not-a-cid", "Qm123", "bafy!!", ""])
def test_rejects_non_cid(h, UserError, cid):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    h.warp_to(readings[-1]["t"])
    h.acting_as(DEVICE)
    with pytest.raises(UserError, match="Not an IPFS CID"):
        h.contract.commit_batch(pol, 1, cid, reference.root(readings), readings[0]["t"], readings[-1]["t"], 12)


def test_rejects_bad_root(h, UserError):
    _, pol = h.setup_policy()
    with pytest.raises(UserError, match="merkle_root"):
        h.commit(pol, h.series(h.NOMINAL), root="abc")


def test_rejects_future_timestamps(h, UserError):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    body = h.doc(pol, 1, readings)
    h.acting_as(DEVICE)  # clock left at purchase time: the batch ends ~an hour ahead
    with pytest.raises(UserError, match="in the future"):
        h.contract.commit_batch(pol, 1, fake_cid(body), reference.root(readings), readings[0]["t"], readings[-1]["t"], 12)


def test_rejects_readings_before_cover_started(h, UserError):
    """Buying cover after the cargo already warmed must not be possible."""
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL, start=h.now - 3600)
    with pytest.raises(UserError, match="outside the cover period"):
        h.commit(pol, readings)


def test_rejects_backdated_batch_older_than_commit_lag(h, UserError):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    h.warp_to(readings[0]["t"] + LAG + 1)
    with pytest.raises(UserError, match="older than the commit lag"):
        h.commit(pol, readings)


def test_batch_exactly_at_lag_is_accepted(h):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    h.warp_to(readings[0]["t"] + LAG)
    h.commit(pol, readings)


def test_rejects_overlap_with_previous_batch(h, UserError):
    _, pol = h.setup_policy()
    first = h.series(h.NOMINAL)
    h.commit(pol, first)
    overlapping = h.series(h.NOMINAL, start=first[-1]["t"] - 60)
    with pytest.raises(UserError, match="overlaps"):
        h.commit(pol, overlapping)


def test_rejects_oversized_count(h, UserError):
    _, pol = h.setup_policy()
    readings = h.series(h.NOMINAL)
    h.warp_to(readings[-1]["t"])
    h.acting_as(DEVICE)
    with pytest.raises(UserError, match="count must be"):
        h.contract.commit_batch(pol, 1, fake_cid(b"x"), reference.root(readings), readings[0]["t"], readings[-1]["t"], 721)


def test_transfer_does_not_rebind_the_device(h):
    _, pol = h.setup_policy()
    h.acting_as(HOLDER)
    h.contract.transfer_policy(pol, STRANGER)
    h.commit(pol, h.series(h.NOMINAL))  # still the device, not the new holder
    assert h.contract.get_policy(pol)["holder"] == STRANGER.as_hex


def test_commit_does_not_touch_the_network(h):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    assert h.gl.nondet.web.fetches == []
    assert not any(url.startswith(GATEWAY) for url in h.gl.nondet.web.fetches)
