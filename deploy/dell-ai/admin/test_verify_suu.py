#!/usr/bin/env python3
"""Offline validation of llama.cpp chat response parsing (no external API)."""
import importlib.util
from pathlib import Path
import unittest

module_path = Path(__file__).with_name("verify-suu.py")
spec = importlib.util.spec_from_file_location("suu_verify", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ChatResponseTests(unittest.TestCase):
    def test_normal_content(self):
        payload = {"choices": [{"message": {"content": "SUU listo."}, "finish_reason": "stop"}],
                   "usage": {"completion_tokens": 5}}
        self.assertEqual(module.unpack_completion(payload), ("SUU listo.", "stop", 0, 5))

    def test_reasoning_only_length_exhaustion(self):
        payload = {"choices": [{"message": {"content": "",
                                            "reasoning_content": "diagnostic internal"},
                                "finish_reason": "length"}],
                   "usage": {"completion_tokens": 48}}
        self.assertEqual(module.unpack_completion(payload), ("", "length", 19, 48))

    def test_missing_choices(self):
        self.assertEqual(module.unpack_completion({}), ("", "missing_choices", 0, 0))


if __name__ == "__main__":
    unittest.main()
