#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("register-suu-docker.py")
spec = importlib.util.spec_from_file_location("register_suu", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PolicyTests(unittest.TestCase):
    def test_preserves_security_constraints(self):
        before = {
            "docker": ["intranet-portal", "intranet-antivirus"],
            "systemd": ["innova-mcp-tunnel.service"],
            "projects": {"intranet": {"services": ["portal", "clamav"], "sha256": "locked"}},
            "catalog": [],
            "auth": {"require_owner": True, "require_tailscale": True}
        }
        after = module.prepare(before)
        self.assertEqual(after["docker"], ["intranet-portal", "intranet-antivirus", "suu-llm"])
        for field in ("systemd", "projects", "catalog", "auth"):
            self.assertEqual(before[field], after[field])
        self.assertNotIn("suu-llm", before["docker"])
        self.assertEqual(after, module.prepare(after))

    def test_fail_closed_unknown_formats(self):
        for value in (None, {}, {"docker": "all"}, {"docker": ["safe"], "catalog": {}},
                      {"docker": ["safe"], "projects": []},
                      {"docker": [3]}):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    module.prepare(value)

    def test_dry_run_does_not_write(self):
        with tempfile.TemporaryDirectory() as d:
            policy = pathlib.Path(d) / "policy.json"
            raw = json.dumps({"docker": ["existing"], "catalog": []})
            policy.write_text(raw)
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--policy", str(policy)],
                check=True, text=True, capture_output=True
            )
            self.assertIn("no se ha escrito", result.stdout)
            self.assertEqual(policy.read_text(), raw)

    def test_apply_creates_backup(self):
        with tempfile.TemporaryDirectory() as d:
            policy = pathlib.Path(d) / "policy.json"
            original = {"docker": ["existing"], "catalog": [], "tailnet_owner_approval": True}
            policy.write_text(json.dumps(original))
            subprocess.run(
                [sys.executable, str(SCRIPT), "--policy", str(policy), "--apply"],
                check=True, text=True, capture_output=True
            )
            result = json.loads(policy.read_text())
            self.assertEqual(result["docker"], ["existing", "suu-llm"])
            self.assertTrue(result["tailnet_owner_approval"])
            backups = list(pathlib.Path(d).glob("policy.json.bak.*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(json.loads(backups[0].read_text()), original)

if __name__ == "__main__":
    unittest.main()
