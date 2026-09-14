"""Reference generator for fixtures/merkle-vectors.json.

A third, standalone implementation of the batch Merkle encoding - hashlib and
json only, no contract import, no agent import. The contract's test suite and
the agent's test suite each assert against the JSON this writes, so neither
side can pass by agreeing with itself.

Encoding:
  leaf  = sha256(0x00 || canonical_json(reading))
  node  = sha256(0x01 || left || right)
  odd node at the end of a level is promoted unchanged (never duplicated)
  canonical_json = keys c,d,lat,lon,t sorted, separators (",", ":"), device lowercase

Run: python fixtures/make_merkle_vectors.py
"""
import hashlib
import json
import pathlib

DEVICE = "0x9a3c0d5e7b1f24a86c3e5d7f9b1a2c4e6d8f0a1b"


def canonical(r):
    return json.dumps(
        {"c": r["c"], "d": r["d"], "lat": r["lat"], "lon": r["lon"], "t": r["t"]},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()


def root(readings):
    level = [hashlib.sha256(b"\x00" + canonical(r)).digest() for r in readings]
    while len(level) > 1:
        level = [
            hashlib.sha256(b"\x01" + level[i] + level[i + 1]).digest() if i + 1 < len(level) else level[i]
            for i in range(0, len(level), 2)
        ]
    return level[0].hex()


def series(n, start=1767225600, temp=40, lat=5190000, lon=447000):
    return [
        {"t": start + 60 * i, "c": temp + (i % 7) - 3, "lat": lat + 11 * i, "lon": lon - 7 * i, "d": DEVICE}
        for i in range(n)
    ]


def main():
    cases = []
    for n in (1, 2, 3, 4, 5, 7, 8, 13):
        readings = series(n)
        cases.append({"name": f"{n} readings", "readings": readings, "root": root(readings)})
    negative = series(3, temp=-185, lat=-3386000, lon=-7050000)
    cases.append({"name": "negative temps and coordinates", "readings": negative, "root": root(negative)})
    first = series(2)
    cases.append(
        {
            "name": "leaf canonical bytes",
            "readings": first[:1],
            "root": root(first[:1]),
            "canonical": canonical(first[0]).decode(),
        }
    )
    out = pathlib.Path(__file__).with_name("merkle-vectors.json")
    out.write_text(json.dumps({"device": DEVICE, "cases": cases}, indent=2) + "\n")
    print(f"wrote {len(cases)} cases to {out}")


if __name__ == "__main__":
    main()
