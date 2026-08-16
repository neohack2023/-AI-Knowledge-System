"""Deterministic hashing for a bounded JSON-compatible data subset.

This is AIOS_CANONICAL_JSON_V1, not an implementation of RFC 8785/JCS.
It accepts JSON-native mappings/lists plus str/int/bool/None and rejects
floats to avoid cross-runtime number serialization ambiguity.
"""

from __future__ import annotations

import hashlib
import json
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any


class CanonicalJSONError(ValueError):
    """Raised when a value is outside AIOS_CANONICAL_JSON_V1."""


def _normalize(value: Any) -> Any:
    if value is None or isinstance(value, bool) or (
        isinstance(value, int) and not isinstance(value, bool)
    ):
        return value

    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)

    if isinstance(value, float):
        raise CanonicalJSONError("floats are not supported by AIOS_CANONICAL_JSON_V1")

    if isinstance(value, Mapping):
        normalized = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise CanonicalJSONError("object keys must be strings")
            normalized[unicodedata.normalize("NFC", key)] = _normalize(item)
        if len(normalized) != len(value):
            raise CanonicalJSONError("key collision after Unicode normalization")
        return normalized

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_normalize(item) for item in value]

    raise CanonicalJSONError(f"unsupported value type: {type(value).__name__}")


def canonical_json_bytes(value: Any) -> bytes:
    """Return deterministic UTF-8 bytes for AIOS_CANONICAL_JSON_V1."""
    normalized = _normalize(value)
    return json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def sha256_json(value: Any) -> str:
    """Return a ``sha256:<hex>`` digest for a supported structured value."""
    return "sha256:" + hashlib.sha256(canonical_json_bytes(value)).hexdigest()
