# Code Store Policy v0.1

1. Exact digest, source revision, provenance, license, and validation receipt are mandatory.
2. Only terminal `VERIFIED` with license gate `PASS` is executable-lane eligible.
3. `VERIFIED` does not mean `REUSABLE`; cross-context proof is separate.
4. `REWRITE_REQUIRED`, `BLOCKED`, `PARTIAL`, `REJECTED`, and `ANTI_PATTERN` cannot enter `units/`.
5. Byte changes require a new digest and revalidation.
6. Registry/store disagreement fails closed and must be reported, never silently reconciled.
7. Store writes grant no canon or developer-memory authority.
