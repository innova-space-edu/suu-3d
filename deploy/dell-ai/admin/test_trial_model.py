import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("trial", Path(__file__).with_name("trial-model.py"))
trial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trial)


def scored(correct):
    rows = [{"case": case, "exact_match": index < correct} for index, (case, _, expected) in
            enumerate((row for row in trial.quality.CASES if row[2] is not None))]
    return rows


class TrialTests(unittest.TestCase):
    def test_two_b_profile_pins_weights_and_uses_distinct_local_file(self):
        try:
            trial.select_profile("qwen-2b")
            self.assertEqual(trial.MODEL, "Qwen3.5-2B-Q5_K_M.gguf")
            self.assertEqual(trial.MODEL_BYTES, 1568476256)
            self.assertEqual(trial.MODEL_SHA, "3f50d5f830873c22d33558f69eb2c34aa59858f37e7a58a982aae88bb38ebe88")
            self.assertIn("/resolve/7d26695454df6de5fbcce2e58681e62dae06ce43/", trial.URL)
            self.assertTrue(trial.URL.endswith("Qwen_Qwen3.5-2B-Q5_K_M.gguf"))
            text = trial.new_profile("CUSTOM=keep\n", "ghcr.io/ggml-org/llama.cpp@sha256:" + "a" * 64)
            self.assertIn("SUU_MODEL_FILE=Qwen3.5-2B-Q5_K_M.gguf\n", text)
            with self.assertRaises(ValueError):
                trial.select_profile("arbitrary-repository")
        finally:
            trial.select_profile("qwen-4b")

    def test_four_b_report_cannot_activate_two_b_weights(self):
        try:
            with tempfile.TemporaryDirectory() as folder:
                report = Path(folder) / "report.json"
                report.write_text(json.dumps({"candidate_sha": trial.PROFILES["qwen-4b"]["sha"],
                    "preset": "current", "baseline": scored(3), "candidate": scored(10),
                    "voice_probe": {"first_audio_ready_seconds": 4, "model_total_seconds": 20, "piper_rtf": .3}}))
                trial.select_profile("qwen-2b")
                with patch.object(trial, "docker") as docker:
                    with self.assertRaises(ValueError):
                        trial.activate([], report, "secret")
                    docker.assert_not_called()
        finally:
            trial.select_profile("qwen-4b")

    def test_resource_gate_preserves_host_headroom(self):
        with self.assertRaises(ValueError):
            trial.require_memory(6 * trial.GIB)
        trial.require_memory(7 * trial.GIB)

    def test_profile_preserves_owner_and_other_configuration(self):
        before = "SUU_RUN_UID=1000\nSUU_RUN_GID=1000\nCUSTOM=keep\nSUU_MODEL_FILE=old.gguf\n"
        digest = "ghcr.io/ggml-org/llama.cpp@sha256:" + "a" * 64
        after = trial.new_profile(before, digest)
        self.assertIn("SUU_RUN_UID=1000\n", after)
        self.assertIn("CUSTOM=keep\n", after)
        self.assertIn("SUU_LLM_MEMORY=5g\n", after)
        self.assertEqual(after.count("SUU_MODEL_FILE="), 1)
        with self.assertRaises(ValueError):
            trial.new_profile(before, "untrusted/image:latest")

    def test_duplicate_or_missing_tests_cannot_pass_quality_gate(self):
        self.assertEqual(trial.score(scored(9)), 9)
        with self.assertRaises(ValueError):
            trial.score(scored(10)[1:])
        with self.assertRaises(ValueError):
            trial.score(scored(10) + scored(10))

    def test_unicode_chemical_subscripts_do_not_fail_exact_matching(self):
        self.assertEqual(trial.quality.normalized("H₂O."), "h2o")
        self.assertEqual(trial.quality.normalized("París."), "paris")

    def test_failed_activation_restores_both_original_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / "installed"
            (target / "models").mkdir(parents=True)
            source = root / "repo"
            (source / "admin").mkdir(parents=True)
            (source / "compose.yaml").write_text("new compose")
            original_compose, original_env = "old compose", "SUU_RUN_UID=1000\nCUSTOM=preserve\n"
            (target / "compose.yaml").write_text(original_compose)
            (target / ".env").write_text(original_env)
            model = target / "models" / trial.MODEL
            model.write_bytes(b"test-model")
            model_sha = hashlib.sha256(b"test-model").hexdigest()
            report = target / "report.json"
            report.write_text(json.dumps({"candidate_sha": model_sha, "preset": "current", "baseline": scored(4), "candidate": scored(10),
                                          "voice_probe": {"model_total_seconds": 8, "first_audio_ready_seconds": 3, "piper_rtf": .3},
                                          "image_id": "tested-image", "image_digest": "ghcr.io/ggml-org/llama.cpp@sha256:" + "a" * 64}))
            old_hash = hashlib.sha256(original_compose.encode()).hexdigest()
            calls = []
            def restart(_cmd):
                calls.append((target / "compose.yaml").read_text())
                if len(calls) == 1:
                    raise RuntimeError("failed candidate startup")
            with patch.object(trial, "TARGET", target), patch.object(trial, "ROOT", source / "admin"), \
                 patch.object(trial, "MODEL_SHA", model_sha), patch.object(trial, "ORIGINAL_COMPOSE_SHA", old_hash), \
                 patch.object(trial, "memory_available", return_value=8 * trial.GIB), \
                 patch.object(trial, "docker", return_value="tested-image"), \
                 patch.object(trial, "compose_up", side_effect=restart), patch.object(trial, "wait_ready"):
                with self.assertRaises(RuntimeError):
                    trial.activate([], report, "private-key-never-printed")
            self.assertEqual((target / ".env").read_text(), original_env)
            self.assertEqual((target / "compose.yaml").read_text(), original_compose)
            self.assertEqual(calls, ["new compose", "old compose"])

    def test_temporary_container_is_removed_after_readiness_failure(self):
        with patch.object(trial, "docker", return_value="temporary-id") as launch, \
             patch.object(trial, "wait_ready", side_effect=RuntimeError("not ready")), \
             patch.object(trial.subprocess, "run") as cleanup:
            with self.assertRaises(RuntimeError):
                with trial.candidate_container(["docker"], "tested-image", "private-key"):
                    self.fail("failed container must not be yielded")
            cleanup.assert_called_once()
            self.assertEqual(cleanup.call_args.args[0], ["docker", "rm", "-f", "temporary-id"])
            self.assertIn("127.0.0.1:8097:8080", launch.call_args.args)
            self.assertNotIn("private-key", launch.call_args.args)

    def test_thread_count_is_applied_to_container_and_profile(self):
        image = "ghcr.io/ggml-org/llama.cpp@sha256:" + "a" * 64
        text = trial.new_profile("CUSTOM=keep\n", image, 4)
        self.assertIn("SUU_LLM_THREADS=4\n", text)
        self.assertIn("SUU_LLM_CPUS=4\n", text)
        with patch.object(trial, "docker", return_value="temporary-id") as launch, \
             patch.object(trial, "wait_ready"), patch.object(trial.subprocess, "run"):
            with trial.candidate_container(["docker"], image, "secret", 4):
                pass
        args = launch.call_args.args
        self.assertEqual(args[args.index("--cpus") + 1], "4")
        self.assertEqual(args[args.index("--threads") + 1], "4")

    def test_slow_first_audio_cannot_activate_even_with_good_quality(self):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "report.json"
            report.write_text(json.dumps({"candidate_sha": trial.MODEL_SHA, "preset": "current",
                "baseline": scored(5), "candidate": scored(10),
                "voice_probe": {"model_total_seconds": 36, "first_audio_ready_seconds": 14.2, "piper_rtf": .55}}))
            with patch.object(trial, "docker") as docker:
                with self.assertRaisesRegex(ValueError, "8 s"):
                    trial.activate([], report, "secret")
                docker.assert_not_called()

    def test_physical_core_detection_does_not_count_smt_twice(self):
        cpuinfo = "physical id : 0\ncore id : 0\n\nphysical id : 0\ncore id : 0\n\nphysical id : 0\ncore id : 1"
        with patch.object(Path, "read_text", return_value=cpuinfo):
            self.assertEqual(trial.physical_cores(), 2)
        with patch.object(Path, "read_text", return_value="unknown topology"):
            self.assertEqual(trial.physical_cores(), 2)

    def test_bad_quality_never_reaches_docker_or_writes_profile(self):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "report.json"
            report.write_text(json.dumps({"candidate_sha": trial.MODEL_SHA, "preset": "current", "baseline": scored(4), "candidate": scored(6)}))
            with patch.object(trial, "docker") as docker:
                with self.assertRaises(ValueError):
                    trial.activate([], report, "private-key")
                docker.assert_not_called()


if __name__ == "__main__":
    unittest.main()
