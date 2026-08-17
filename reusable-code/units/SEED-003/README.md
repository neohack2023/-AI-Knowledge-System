# SEED-003 — Stable JSON SHA-256 digest

Status: `VERIFIED` / admitted to the bounded executable Code Store lane.

Purpose: deterministic fingerprints for a deliberately bounded JSON-compatible subset used by receipts and structured-state identity.

This unit defines `AIOS_CANONICAL_JSON_V1`. It is **not** RFC 8785/JCS. It normalizes Unicode strings/keys to NFC, sorts object keys, uses compact JSON, and rejects floats and non-string object keys.

`VERIFIED` does not mean `REUSABLE`; cross-project usage evidence remains separate.
