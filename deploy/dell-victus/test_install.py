import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("install", Path(__file__).with_name("install.py"))
install = importlib.util.module_from_spec(spec)
spec.loader.exec_module(install)
IMAGE = "suu-victus-relay:" + "a" * 16
URL = "http://100.98.233.4:11434"


class InstallerTests(unittest.TestCase):
    def test_render_preserves_private_entry_and_does_not_touch_voice_or_stt(self):
        text = install.render(IMAGE, URL)
        self.assertIn("127.0.0.1:8094:8080", text)
        self.assertIn("/run/secrets/suu_api_key:ro", text)
        self.assertIn("read_only: true", text)
        self.assertNotIn("8095", text)
        self.assertNotIn("8096", text)
        self.assertIn(IMAGE, text)
        for url in ("http://example.com:11434", "http://100.63.1.1:11434", URL + "/api"):
            with self.assertRaises(ValueError):
                install.render(IMAGE, url)

    def test_unknown_compose_is_preserved_but_exact_managed_profile_is_accepted(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(install, "TARGET", Path(folder)):
            compose = Path(folder) / "compose.yaml"
            compose.write_text("unrelated deployment")
            with self.assertRaisesRegex(ValueError, "personalizado"):
                install.validate_current()
            self.assertEqual(compose.read_text(), "unrelated deployment")
            compose.write_text(install.render(IMAGE, URL))
            install.validate_current()

    def test_activation_failure_restores_original_compose_without_modifying_environment(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(install, "TARGET", Path(folder)):
            root = Path(folder)
            (root / "compose.yaml").write_text("old compose")
            (root / ".env").write_text("custom environment preserved")
            calls = []
            def up(_):
                calls.append((root / "compose.yaml").read_text())
                if len(calls) == 1:
                    raise RuntimeError("synthetic deployment failure")
            with patch.object(install, "up", side_effect=up), patch.object(install, "wait_health", return_value={"status": "ok"}):
                with self.assertRaises(RuntimeError):
                    install.activate(["docker"], "new compose", "private-never-printed")
            self.assertEqual(calls, ["new compose", "old compose"])
            self.assertEqual((root / ".env").read_text(), "custom environment preserved")
            self.assertEqual((root / "compose.yaml").read_text(), "old compose")

    def test_smoke_requires_backend_header_and_real_stream_termination(self):
        for payload in (b'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n', b'data: {"error":{}}\n\n'):
            stream = io.BytesIO(payload)
            stream.headers = {"X-SUU-Backend": "victus"}
            with patch.object(install.OPENER, "open", return_value=stream):
                with self.assertRaises(ValueError):
                    install.smoke(8097, "synthetic-private-token")

    def test_failed_warmup_does_not_make_owner_wait_full_readiness_timeout(self):
        error = urllib.error.HTTPError("http://localhost/health", 503, "Unavailable", {},
                                      io.BytesIO(b'{"backend":"victus","warmup_complete":true}'))
        with patch.object(install.OPENER, "open", side_effect=error), patch.object(install.time, "sleep") as sleep:
            with self.assertRaisesRegex(ValueError, "precargar"):
                install.wait_health(8097)
            sleep.assert_not_called()

    def test_rollback_refuses_modified_backups(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(install, "TARGET", Path(folder)):
            backup = Path(folder) / "backups/test"
            backup.mkdir(parents=True)
            (backup / "compose.yaml").write_text("modified")
            (backup / "manifest.json").write_text(json.dumps({"compose_sha": "not-the-real-hash"}))
            with patch.object(install, "up") as up:
                with self.assertRaisesRegex(ValueError, "modificado"):
                    install.restore(["docker"], backup)
                up.assert_not_called()


if __name__ == "__main__":
    unittest.main()
