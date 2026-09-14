"""A minimal in-process stand-in for the GenVM host, used by tests/unit.

Why this exists: gltest's direct mode fixes the contract clock for the life of
a deployment and does not model balances or external transfers. GenSupply's
core guarantees are all time- and money-shaped - the commit-lag backdating
guard, breach duration across hours of readings, the claim grace period,
reservation release, and "the pool never pays out more than it holds" - so
those need a host whose clock and balance the test controls.

This module supplies just enough of the `genlayer` namespace to import
`contracts/gensupply.py` unmodified and run it as ordinary Python, with the
non-deterministic primitives served from test-controlled pages and queues.

What that does and does not prove:
  - It exercises the real contract source: every guard, state transition,
    Merkle rebuild and wei-level calculation is the shipped code.
  - `strict_eq` runs the real leader body against registered pages, so the
    fetch-and-parse path is covered, not stubbed.
  - `run_nondet_unsafe` runs the real leader (prompt building, response
    parsing) and, when `gl.vm.validate` is on, the real validator too.
  - It does NOT model GenVM storage encoding, gas, or validator consensus
    over a real model. Storage realism is tests/direct; real LLM outcomes are
    the live smoke run.
"""
import json as _json
import sys
import types


class UserError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Address:
    __slots__ = ("_hex",)

    def __init__(self, value):
        if isinstance(value, Address):
            self._hex = value._hex
            return
        if isinstance(value, bytes):
            raw = value
        else:
            text = str(value)
            if text.startswith("0x") or text.startswith("0X"):
                text = text[2:]
            try:
                raw = bytes.fromhex(text)
            except ValueError:
                raise Exception(f"invalid address {value}")
        # The real SDK rejects anything that is not exactly 20 bytes.
        if len(raw) != 20:
            raise Exception(f"invalid address {value}")
        self._hex = "0x" + raw.hex()

    @property
    def as_hex(self) -> str:
        """Lowercase, where the real SDK returns EIP-55 checksummed. The contract
        lowercases before every comparison, which tests/direct covers."""
        return self._hex

    @property
    def as_bytes(self) -> bytes:
        return bytes.fromhex(self._hex[2:])

    def __eq__(self, other):
        return isinstance(other, Address) and other._hex == self._hex

    def __hash__(self):
        return hash(self._hex)

    def __repr__(self):
        return f"Address({self._hex})"


MAX_U256 = 2**256 - 1


class u256(int):
    """Range-checked at construction - stricter and earlier than the real
    storage encoder, which raises OverflowError on write. A negative reaching
    here is an accounting bug and should fail loudly."""

    def __new__(cls, value=0):
        number = int(value)
        if number < 0:
            raise AssertionError(f"u256 underflow: {number}")
        if number > MAX_U256:
            raise AssertionError(f"u256 overflow: {number}")
        return super().__new__(cls, number)


class _Generic:
    def __class_getitem__(cls, item):
        return cls


class TreeMap(dict, _Generic):
    pass


class DynArray(list, _Generic):
    pass


def allow_storage(cls):
    return cls


class _Message:
    def __init__(self):
        self.sender_address = Address("0x" + "00" * 20)
        self.value = u256(0)


class _Public:
    class _Write:
        def __call__(self, fn):
            fn.__gl_write__ = True
            return fn

        def payable(self, fn):
            fn.__gl_payable__ = True
            return fn

    def __init__(self):
        self.write = self._Write()

    def view(self, fn):
        fn.__gl_view__ = True
        return fn


class InsufficientBalance(AssertionError):
    """The contract tried to pay out more than it holds."""


class _ExternalRecipient:
    def __init__(self, address, gl):
        self._address = address
        self._gl = gl

    def emit_transfer(self, value, **kwargs):
        if kwargs:
            raise TypeError(f"external emit_transfer takes no {list(kwargs)}")
        amount = int(value)
        if amount <= 0:
            raise ValueError("value must be greater than 0 for emit_transfer")
        if amount > self._gl.balance:
            raise InsufficientBalance(f"contract tried to send {amount} holding only {self._gl.balance}")
        self._gl.balance -= amount
        self._gl.transfers.append({"to": self._address, "value": amount})


class _InternalContract:
    def __init__(self, address):
        self._address = address

    def emit_transfer(self, value, on="finalized"):
        raise AssertionError(
            "gl.get_contract_at(...).emit_transfer() is the IC->IC form and cannot pay an EOA"
        )


class Return:
    """Stands in for gl.vm.Return - what a validator receives on leader success."""

    def __init__(self, calldata):
        self.calldata = calldata


class _LeaderError:
    """What a validator receives when the leader raised."""

    def __init__(self, message):
        self.message = message


class _Vm:
    UserError = UserError
    Return = Return

    def __init__(self):
        # When True, every run_nondet_unsafe also runs the contract's real
        # validator against the leader's result, and records its vote.
        self.validate = False
        self.votes = []

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        try:
            result = leader_fn()
        except UserError as err:
            if self.validate:
                self.votes.append(bool(validator_fn(_LeaderError(err.message))))
            raise
        if self.validate:
            self.votes.append(bool(validator_fn(Return(result))))
        return result


class _Contract:
    """Materialises storage fields from annotations before the contract's __init__."""

    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        for name, annotation in getattr(cls, "__annotations__", {}).items():
            if annotation is TreeMap or getattr(annotation, "__name__", "") == "TreeMap":
                setattr(instance, name, TreeMap())
            elif annotation is DynArray or getattr(annotation, "__name__", "") == "DynArray":
                setattr(instance, name, DynArray())
            else:
                setattr(instance, name, u256(0))
        return instance


class _EqPrinciple:
    def __init__(self):
        self.calls = []

    def strict_eq(self, fn):
        """No model involved, so the real leader body simply runs."""
        self.calls.append("strict_eq")
        return fn()


class Response:
    def __init__(self, status, body, headers=None):
        self.status = status
        self.body = body
        self.headers = headers or {}


class _Web:
    def __init__(self):
        self.pages = {}     # exact url -> (status, bytes)
        self.prefixes = []  # (prefix, (status, bytes)), checked after exact pages
        self.fetches = []

    def get(self, url, headers=None):
        self.fetches.append(url)
        if url in self.pages:
            status, body = self.pages[url]
            return Response(status, body)
        for prefix, (status, body) in self.prefixes:
            if url.startswith(prefix):
                return Response(status, body)
        raise RuntimeError(f"no page registered for {url}")

    def render(self, url, mode="text"):
        raise AssertionError("the contract must use raw web.get, never render")


class _Nondet:
    def __init__(self):
        self.web = _Web()
        self.prompts = []
        self.responses = []

    def exec_prompt(self, prompt, response_format=None):
        """With response_format="json" GenVM returns an already-parsed object,
        so queued JSON text is decoded before it is handed over."""
        self.prompts.append(prompt)
        if not self.responses:
            raise AssertionError("no queued exec_prompt response")
        response = self.responses.pop(0)
        if response_format == "json" and isinstance(response, str):
            return _json.loads(response)
        return response


class _Evm:
    def __init__(self, gl):
        self._gl = gl

    def contract_interface(self, _declaration):
        gl = self._gl

        def factory(address):
            return _ExternalRecipient(address, gl)

        return factory


class _Gl:
    def __init__(self):
        self.vm = _Vm()
        self.public = _Public()
        self.message = _Message()
        self.message_raw = {"datetime": "2026-03-01T00:00:00Z"}
        self.eq_principle = _EqPrinciple()
        self.nondet = _Nondet()
        self.Contract = _Contract
        self.transfers = []
        self.balance = 0
        self.evm = _Evm(self)

    def get_contract_at(self, address):
        return _InternalContract(address)


def install():
    """Register a fresh fake `genlayer` module and return its `gl` singleton."""
    gl = _Gl()
    module = types.ModuleType("genlayer")
    module.gl = gl
    module.Address = Address
    module.u256 = u256
    module.TreeMap = TreeMap
    module.DynArray = DynArray
    module.allow_storage = allow_storage
    module.__all__ = ["gl", "Address", "u256", "TreeMap", "DynArray", "allow_storage"]
    sys.modules["genlayer"] = module
    return gl
