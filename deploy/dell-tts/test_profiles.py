import unittest
from profiles import recommended, update_env


class ProfileTests(unittest.TestCase):
    def rows(self, medium):
        return [{"voice": "es_AR-daniela-high", "threads": 1, "median_rtf": 1.89},
                {"voice": "es_ES-sharvard-medium", "threads": 1, "median_rtf": medium},
                {"voice": "es_ES-sharvard-medium", "threads": 2, "median_rtf": .2}]

    def test_only_realtime_single_cpu_candidate_is_automatically_selected(self):
        self.assertEqual(recommended(self.rows(.7)), "sharvard")
        self.assertEqual(recommended(self.rows(1.1)), "keep")
        rows = self.rows(.7)
        rows[0]["median_rtf"] = .75
        self.assertEqual(recommended(rows), "keep")

    def test_missing_or_invalid_results_never_trigger_selection(self):
        for rows in ([], self.rows(float("nan")), self.rows(-1), self.rows(.7) * 2):
            with self.assertRaises(ValueError):
                recommended(rows)

    def test_profile_keeps_credentials_and_selects_female_speaker(self):
        original = "TTS_UID=1000\nTTS_GID=1000\nPRIVATE_SETTING=keep\nPIPER_THREADS=1\n"
        result = update_env(original, "sharvard", 2)
        self.assertIn("PRIVATE_SETTING=keep\n", result)
        self.assertIn("PIPER_SPEAKER_ID=1\n", result)
        self.assertIn("PIPER_THREADS=2\n", result)
        self.assertIn("TTS_CPUS=2\n", result)
        self.assertEqual(result.count("PIPER_THREADS="), 1)
        restored = update_env(result, "daniela", 1)
        self.assertIn("PIPER_MODEL_NAME=es_AR-daniela-high\n", restored)
        self.assertIn("PIPER_SPEAKER_ID=0\n", restored)
        with self.assertRaises(ValueError):
            update_env(original, "arbitrary", 8)
