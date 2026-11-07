import unittest
from service import extract_phones

class AcousticResponseTests(unittest.TestCase):
    def test_only_phone_tiers_are_exposed(self):
        payload = {"tiers": {
            "phones": {"entries": [[0.1, 0.2, "m"], [0.2, 0.43, "a"], [0.43, 0.50, "sil"]]},
            "words": {"entries": [[0.1, 0.50, "mamá"]]}
        }}
        self.assertEqual([p["phone"] for p in extract_phones(payload)], ["m", "a", "sil"])

    def test_invalid_intervals_and_unknown_tiers_are_ignored(self):
        payload = {"tiers": {"phones": {"entries": [
            [0.2, 0.1, "m"], [-1, 0.3, "a"], [0.1, 0.2, "t"],
            [0.7, 0.8, 123], ["bad", 2, "x"]
        ]}, "utterances": {"entries": [[0, 1, "audio"]]}}}
        self.assertEqual(extract_phones(payload), [{"phone": "t", "start": 0.1, "end": 0.2}])

if __name__ == "__main__":
    unittest.main()
