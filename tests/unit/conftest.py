"""Fixtures for the in-process suite. Helpers live in harness.py; see glstub.py for what this proves."""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import glstub  # noqa: E402
from harness import Harness  # noqa: E402


@pytest.fixture
def h():
    return Harness()


@pytest.fixture
def UserError():
    return glstub.UserError
