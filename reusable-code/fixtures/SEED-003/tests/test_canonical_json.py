from __future__ import annotations

import unittest

from canonical_json import CanonicalJSONError, canonical_json_bytes, sha256_json


class CanonicalJSONTests(unittest.TestCase):
    def test_key_order_is_stable(self):
        left = {"b": 2, "a": 1}
        right = {"a": 1, "b": 2}
        self.assertEqual(canonical_json_bytes(left), canonical_json_bytes(right))
        self.assertEqual(sha256_json(left), sha256_json(right))

    def test_unicode_nfc_is_stable(self):
        composed = {"name": "café"}
        decomposed = {"name": "cafe\u0301"}
        self.assertEqual(sha256_json(composed), sha256_json(decomposed))

    def test_nested_values_are_stable(self):
        value = {"tags": ["b", "a"], "ok": True, "count": 3, "none": None}
        self.assertEqual(
            canonical_json_bytes(value),
            b'{"count":3,"none":null,"ok":true,"tags":["b","a"]}',
        )

    def test_float_is_rejected(self):
        with self.assertRaises(CanonicalJSONError):
            sha256_json({"x": 0.1})

    def test_non_string_key_is_rejected(self):
        with self.assertRaises(CanonicalJSONError):
            sha256_json({1: "x"})


if __name__ == "__main__":
    unittest.main()
