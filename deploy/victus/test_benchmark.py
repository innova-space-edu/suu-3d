import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("victus", Path(__file__).with_name("benchmark.py"))
victus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(victus)


class VictusTests(unittest.TestCase):
    def test_ollama_host_accepts_current_tailscale_and_loopback(self):
        for address, expected in (("100.98.233.4:11434", "http://100.98.233.4:11434"),
                                  ("http://127.0.0.1:11434", "http://127.0.0.1:11434"),
                                  ("localhost", "http://localhost:11434")):
            with patch.dict(victus.os.environ, {"OLLAMA_HOST": address}):
                self.assertEqual(victus.ollama_base(), expected)
        for address in ("https://example.com", "http://user:secret@127.0.0.1:11434", "http://127.0.0.1:11434/path", "100.63.0.1:11434"):
            with patch.dict(victus.os.environ, {"OLLAMA_HOST": address}):
                with self.assertRaises(ValueError):
                    victus.ollama_base()

    def test_local_api_bypasses_proxy_and_uses_configured_host(self):
        with patch.dict(victus.os.environ, {"OLLAMA_HOST": "100.98.233.4:11434"}), \
             patch.object(victus.urllib.request, "build_opener") as opener:
            victus.api("/api/version")
            self.assertEqual(opener.call_args.args[0].proxies, {})
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, "http://100.98.233.4:11434/api/version")

    def test_stream_timing_and_content_ignore_reasoning(self):
        events = [
            {"message": {"thinking": "hidden", "content": "Merc"}, "done": False},
            {"message": {"content": "urio."}, "done": True, "done_reason": "stop",
             "eval_count": 3, "eval_duration": 1000000000, "load_duration": 100000000}]
        data = io.BytesIO("\n".join(json.dumps(row) for row in events).encode())
        deltas = []
        with patch.object(victus, "api", return_value=data) as api:
            result = victus.completion("synthetic-alias", "system", "prompt", deltas.append)
        self.assertEqual(deltas, ["Merc", "urio."])
        self.assertEqual(result["answer"], "Mercurio.")
        self.assertEqual(result["tokens_per_second"], 3)
        self.assertEqual(api.call_args.args[1]["options"]["num_ctx"], 2048)

    def test_truncated_stream_is_rejected(self):
        data = io.BytesIO(b'{"message":{"content":"partial"},"done":false}\n')
        with patch.object(victus, "api", return_value=data):
            with self.assertRaisesRegex(ValueError, "incompleta"):
                victus.completion("synthetic", "system", "prompt")

    def test_download_is_atomic_and_rejects_wrong_existing_files(self):
        payload = b"synthetic model"
        sha = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as folder, patch.object(victus, "DATA", Path(folder)):
            with patch.object(victus.urllib.request, "urlopen", return_value=io.BytesIO(payload)):
                victus.download("test.gguf", "https://example.invalid", len(payload), sha)
            self.assertEqual((Path(folder) / "test.gguf").read_bytes(), payload)
            with patch.object(victus.urllib.request, "urlopen") as network:
                victus.download("test.gguf", "https://example.invalid", len(payload), sha)
                network.assert_not_called()
            with self.assertRaisesRegex(ValueError, "existente"):
                victus.download("test.gguf", "https://example.invalid", len(payload), "0" * 64)

    def test_bad_download_removes_partial_file(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(victus, "DATA", Path(folder)), \
             patch.object(victus.urllib.request, "urlopen", return_value=io.BytesIO(b"bad")):
            with self.assertRaises(ValueError):
                victus.download("test.gguf", "https://example.invalid", 3, "0" * 64)
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_unload_failure_still_removes_only_trial_alias(self):
        with patch.object(victus, "api", side_effect=OSError("synthetic offline")), \
             patch.object(victus.subprocess, "run") as remove:
            with self.assertRaises(OSError):
                victus.cleanup_alias("suu-victus-trial-synthetic")
            remove.assert_called_once_with(["ollama", "rm", "suu-victus-trial-synthetic"], check=False)

    def test_trials_use_verified_4b_and_two_distinct_female_voice_profiles(self):
        self.assertEqual(len(victus.FILES), 5)
        self.assertEqual(victus.FILES[0][2], 2497280736)
        self.assertEqual(victus.FILES[0][3], "2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e")
        for _, url, size, sha in victus.FILES:
            self.assertIn("/resolve/", url)
            self.assertGreater(size, 0)
            self.assertEqual(len(sha), 64)


if __name__ == "__main__":
    unittest.main()
