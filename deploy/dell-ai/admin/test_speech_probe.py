import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("probe", Path(__file__).with_name("speech-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SpeechProbeTests(unittest.TestCase):
    def test_incremental_split_preserves_words_and_waits_for_longer_text(self):
        parts = []
        splitter = probe.SpeechBuffer(parts.append, 35, 80)
        splitter.add("Los planetas orbitan alrededor de")
        self.assertEqual(parts, [])
        splitter.add("l Sol por la atracción gravitatoria.")
        self.assertEqual(parts, ["Los planetas orbitan alrededor del"])
        splitter.finish()
        self.assertEqual(" ".join(parts), "Los planetas orbitan alrededor del Sol por la atracción gravitatoria.")

    def test_speech_budget_and_partial_token_reassembly(self):
        parts = []
        splitter = probe.SpeechBuffer(parts.append, 35, 80)
        splitter.add("Hola, soy SUU y estoy li")
        splitter.add("sta. ")
        self.assertEqual(parts, ["Hola, soy SUU y estoy lista."])
        splitter.add("A" * 1000)
        splitter.finish()
        self.assertTrue(all(len(part) <= 80 for part in parts))
        self.assertLessEqual(sum(map(len, parts)), 700)

    def test_schedule_separates_initial_wait_from_between_clip_gaps(self):
        self.assertEqual(probe.schedule(5, 4, 3), (5, 8, 0))
        self.assertEqual(probe.schedule(5, 7, 3), (7, 10, 2))

    def test_pipeline_synthesizes_every_part_with_only_one_prefetched_clip(self):
        now, calls = [0.], []
        def synthesize(text):
            calls.append((text, now[0]))
            now[0] += .5
            return 2.
        def completion(on_delta):
            on_delta("Una frase suficiente. Otra frase suficiente. Tercera frase suficiente. ")
            return {"total_seconds": 0.}
        def sleep(delay):
            now[0] += delay
        result = probe.measure(completion, synthesize, 35, 35, clock=lambda: now[0], sleep=sleep)
        self.assertEqual(len(calls), 3)
        self.assertEqual([when for _, when in calls], [0., .5, 2.5])
        self.assertEqual(result["first_audio_ready_seconds"], .5)
        self.assertEqual(result["max_gap_estimated_seconds"], 0)
        self.assertEqual(result["piper_rtf"], .25)

    def test_synthesis_failure_and_empty_stream_cannot_produce_valid_metrics(self):
        def completion(on_delta):
            on_delta("Una frase suficiente. ")
            return {"total_seconds": .1}
        def broken(text):
            raise ValueError("synthetic failure")
        with self.assertRaisesRegex(ValueError, "synthetic failure"):
            probe.measure(completion, broken)
        with self.assertRaisesRegex(ValueError, "No se generaron"):
            probe.measure(lambda _: {"total_seconds": .1}, lambda _: 1)


if __name__ == "__main__":
    unittest.main()
