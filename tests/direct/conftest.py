"""Direct-mode fixtures. Helpers live in helpers.py."""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from helpers import GATEWAY, GEN, NOW_ISO  # noqa: E402


@pytest.fixture
def contract(direct_vm, direct_deploy, direct_owner):
    direct_vm.warp(NOW_ISO)
    direct_vm.sender = direct_owner
    return direct_deploy("contracts/gensupply.py", GATEWAY, 6 * 3600, 3 * 86400)


@pytest.fixture
def policy(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie):
    """Product (1-minute minimum breach so it fits the fixed clock), funded pool, policy with charlie as device."""
    direct_vm.sender = direct_owner
    pid = contract.create_product(
        "Reefer cover 5C", 50, 1, 4, 50, 900, 10 * GEN, 1 * GEN,
        "Customs holds are excluded.", ["customs.example.gov"],
    )
    direct_vm.sender = direct_alice
    direct_vm.value = 50 * GEN
    contract.deposit()
    direct_vm.sender = direct_bob
    direct_vm.value = 1 * GEN
    pol = contract.buy_policy(pid, direct_charlie, "SHIP-001", "Rotterdam", "Lagos", 48)
    direct_vm.value = 0
    return pol
