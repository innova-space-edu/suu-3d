import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("victus", Path(__file__).with_name("benchmark.py"))
victus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(victus)


class VictusTests(unittest.TestCase):
    def test_text_only_runs_quality_and_cleans_up_without_loading_voice(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            quality = SimpleNamespace(SYSTEM="synthetic", CASES=[("arithmetic", "synthetic", "9")], normalized=lambda x: x)
            requests = []
            def api(route, payload=None):
                requests.append(route)
                if route == "/api/version":
                    value = {"version": "synthetic"}
                elif requests.count("/api/ps") == 1:
                    value = {"models": []}
                else:
                    value = {"models": [{"name": "suu-victus-trial-123:latest", "size": 300, "size_vram": 300}]}
                return io.BytesIO(json.dumps(value).encode())
            result = {"answer": "9", "first_text_seconds": 1, "total_seconds": 2}
            with patch("sys.argv", ["benchmark.py", "--text-only"]), \
                 patch.dict(victus.os.environ, {"OLLAMA_HOST": "127.0.0.1:11434"}), \
                 patch.object(victus.os, "name", "nt"), patch.object(victus, "ROOT", root), \
                 patch.object(victus, "DATA", root / "data"), patch.object(victus, "api", side_effect=api), \
                 patch.object(victus.shutil, "disk_usage", return_value=SimpleNamespace(free=10 * 1024**3)), \
                 patch.object(victus.time, "time_ns", return_value=123), \
                 patch.object(victus, "load_module", return_value=quality) as load, \
                 patch.object(victus, "download") as download, patch.object(victus.subprocess, "run"), \
                 patch.object(victus, "completion", return_value=result), \
                 patch.object(victus, "make_voice") as voice, patch.object(victus, "cleanup_alias") as cleanup:
                victus.main()
                load.assert_called_once_with("quality", "benchmark-quality.py")
                download.assert_called_once_with(*victus.FILES[0])
                voice.assert_not_called()
                cleanup.assert_called_once_with("suu-victus-trial-123")
            saved = json.loads((root / "data" / "report-123.json").read_text())
            self.assertEqual(saved["mode"], "text-only")
            self.assertNotIn("voices", saved)

    def test_text_only_download_set_excludes_all_voice_assets(self):
        self.assertEqual(victus.trial_files(True), [victus.FILES[0]])
        self.assertEqual(len(victus.trial_files(False)), 5)

    def test_text_summary_keeps_format_scoring_and_actual_times(self):
        rows = [{"exact_match": True, "first_text_seconds": 1, "total_seconds": 3},
                {"exact_match": False, "first_text_seconds": 2, "total_seconds": 5},
                {"exact_match": None, "first_text_seconds": 3, "total_seconds": 8}]
        summary = victus.text_summary(rows)
        self.assertEqual(summary["exact_matches"], 1)
        self.assertEqual(summary["scored_cases"], 2)
        self.assertEqual(summary["median_first_text_seconds"], 2)
        self.assertEqual(summary["median_total_seconds"], 5)

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
