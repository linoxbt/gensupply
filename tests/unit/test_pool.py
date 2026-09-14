"""Capital pool, underwriting capacity, policy ownership and expiry."""
import pytest

from harness import BUYER2, DEVICE, GEN, GRACE, HOLDER, LP, OWNER, STRANGER


def test_only_owner_creates_products(h, UserError):
    h.acting_as(STRANGER)
    with pytest.raises(UserError, match="Only the owner"):
        h.contract.create_product("x", 50, 60, 240, 50, 900, GEN, GEN, "", [])


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"min_breach_minutes": 0}, "min_breach_minutes"),
        ({"min_breach_minutes": 300, "full_breach_minutes": 240}, "full_breach_minutes"),
        ({"threshold_c_x10": 5000}, "threshold"),
        ({"customs_hosts": ["not a host"]}, "customs host"),
        ({"premium_atto": 0}, "positive"),
    ],
)
def test_product_validation(h, UserError, overrides, message):
    with pytest.raises(UserError, match=message):
        h.product(**overrides)


def test_negative_threshold_for_frozen_goods(h):
    pid = h.product(threshold_c_x10=-180)
    assert h.contract.get_product(pid)["threshold_c_x10"] == "-180"


def test_first_deposit_mints_one_to_one(h):
    assert h.fund(10 * GEN) == 10 * GEN
    assert h.contract.shares_of(LP) == str(10 * GEN)


def test_premium_accrues_to_existing_shares(h):
    pid = h.product()
    h.fund(10 * GEN)
    h.buy(pid)
    minted = h.fund(11 * GEN, lp=BUYER2)  # pool now worth 11 GEN per 10 GEN of shares
    assert minted == 10 * GEN


def test_withdrawal_cannot_uncover_live_policies(h, UserError):
    pid = h.product()
    h.fund(10 * GEN)
    h.buy(pid)  # capital 11, locked 10
    h.acting_as(LP)
    with pytest.raises(UserError, match="uncover live policies"):
        h.contract.withdraw(5 * GEN)
    assert int(h.contract.withdraw(GEN // 2)) > 0


def test_capacity_exhausted(h, UserError):
    pid = h.product()
    h.fund(10 * GEN)
    h.buy(pid)
    with pytest.raises(UserError, match="capacity exhausted"):
        h.buy(pid, holder=BUYER2)


def test_underpaid_premium_rejected_overpaid_refunded(h, UserError):
    pid = h.product()
    h.fund()
    with pytest.raises(UserError, match="Premium is"):
        h.buy(pid, value=GEN - 1)
    h.buy(pid, holder=BUYER2, value=3 * GEN)
    assert h.paid_to(BUYER2) == 2 * GEN


def test_closed_product_stops_sales(h, UserError):
    pid = h.product()
    h.fund()
    h.acting_as(OWNER)
    h.contract.close_product(pid)
    with pytest.raises(UserError, match="closed"):
        h.buy(pid)


def test_zero_device_rejected(h, UserError):
    pid = h.product()
    h.fund()
    with pytest.raises(UserError, match="device"):
        h.buy(pid, device=h.module.Address(bytes(20)))


def test_ownership_views(h):
    pid, pol = h.setup_policy()
    assert h.contract.balance_of(HOLDER, pol) == 1
    assert h.contract.balance_of(STRANGER, pol) == 0
    assert h.contract.balance_of(HOLDER, 999) == 0
    assert [p["id"] for p in h.contract.policies_of(HOLDER)] == [str(pol)]


def test_only_holder_transfers(h, UserError):
    _, pol = h.setup_policy()
    h.acting_as(STRANGER)
    with pytest.raises(UserError, match="Only the holder"):
        h.contract.transfer_policy(pol, STRANGER)
    h.acting_as(HOLDER)
    h.contract.transfer_policy(pol, BUYER2)
    assert h.contract.balance_of(BUYER2, pol) == 1


def test_cannot_transfer_during_a_claim(h, UserError):
    _, pol = h.setup_policy()
    h.commit(pol, h.series(h.NOMINAL))
    h.file(pol)
    h.acting_as(HOLDER)
    with pytest.raises(UserError, match="CLAIMING"):
        h.contract.transfer_policy(pol, BUYER2)


def test_release_expired_waits_for_grace(h, UserError):
    _, pol = h.setup_policy()
    expires = int(h.contract.get_policy(pol)["expires_at"])
    h.warp_to(expires + 1)
    h.acting_as(STRANGER)
    with pytest.raises(UserError, match="still claimable"):
        h.contract.release_expired(pol)
    h.warp_to(expires + GRACE)
    h.contract.release_expired(pol)
    assert h.contract.get_policy(pol)["state"] == "EXPIRED"
    assert h.contract.pool_stats()["locked_atto"] == "0"


def test_payout_dilutes_every_lp_proportionally(h):
    pid = h.product()
    h.fund(30 * GEN, lp=LP)
    h.fund(30 * GEN, lp=BUYER2)
    pol = h.buy(pid)
    h.breach_shipment(pol)
    claim = h.file(pol)
    h.verify(claim)
    h.mock_weather()
    h.queue_llm("GENUINE")
    h.adjudicate(claim)
    capital = int(h.contract.pool_stats()["capital_atto"])
    assert capital == 61 * GEN - 7 * GEN
    h.acting_as(LP)
    got = int(h.contract.withdraw(30 * GEN))
    assert got == capital // 2


def test_gateway_is_rotatable_by_owner_only(h, UserError):
    h.acting_as(STRANGER)
    with pytest.raises(UserError, match="Only the owner"):
        h.contract.set_ipfs_gateway("https://ipfs.io/ipfs/")
    h.acting_as(OWNER)
    with pytest.raises(UserError, match="/ipfs/"):
        h.contract.set_ipfs_gateway("https://ipfs.io/")
    h.contract.set_ipfs_gateway("https://ipfs.io/ipfs/")
    assert h.contract.get_config()["ipfs_gateway"] == "https://ipfs.io/ipfs/"
