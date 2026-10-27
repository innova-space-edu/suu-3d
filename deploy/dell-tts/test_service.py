"""CPU-independent service tests. Run with FastAPI installed; no model required."""
import asyncio
import importlib.util
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException


def load_service():
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        (root / "token").write_text("x" * 64)
        (root / "voice.onnx").touch()
        (root / "voice.onnx.json").write_text("{}")
        ort = MagicMock()
        spec = importlib.util.spec_from_file_location("tts_under_test", Path(__file__).with_name("service.py"))
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"PIPER_API_TOKEN_FILE": str(root / "token"),
                                     "PIPER_MODEL": str(root / "voice.onnx"), "PIPER_THREADS": "1"}), \
             patch.dict(sys.modules, {"onnxruntime": ort, "piper": MagicMock(), "piper.config": MagicMock()}):
            spec.loader.exec_module(module)
        return module, ort


def wav_bytes():
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 16000)
    return output.getvalue()


class Request:
    headers = {"authorization": "Bearer " + "x" * 64, "content-type": "application/json"}

    async def body(self):
        return json.dumps({"text": "Hola."}).encode()


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service, self.ort = load_service()

    def test_session_matches_quota_and_disables_spinning(self):
        self.assertEqual(self.service.OPTIONS.intra_op_num_threads, 1)
        self.assertEqual(self.service.OPTIONS.inter_op_num_threads, 1)
        self.service.OPTIONS.add_session_config_entry.assert_any_call("session.intra_op.allow_spinning", "0")
        self.ort.InferenceSession.assert_called_once()

    async def test_metrics_and_lock_release_on_success_and_error(self):
        with patch.object(self.service, "synthesize_wav", return_value=wav_bytes()):
            response = await self.service.synthesize(Request())
        self.assertEqual(float(response.headers["x-suu-audio-seconds"]), 1)
        self.assertIn("piper-synthesis;dur=", response.headers["server-timing"])
        with patch.object(self.service, "synthesize_wav", side_effect=ValueError("private")):
            with self.assertRaises(HTTPException) as error:
                await self.service.synthesize(Request())
        self.assertEqual(error.exception.status_code, 503)
        self.assertNotIn("private", error.exception.detail)
        self.assertTrue(self.service.LOCK.acquire(blocking=False))
        self.service.LOCK.release()

    async def test_cancelled_request_keeps_native_worker_exclusive(self):
        entered, release = threading.Event(), threading.Event()

        def slow(_text):
            entered.set()
            release.wait(3)
            return wav_bytes()

        with patch.object(self.service, "synthesize_wav", side_effect=slow):
            request = asyncio.create_task(self.service.synthesize(Request()))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                request.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await request
                with self.assertRaises(HTTPException) as busy:
                    await self.service.synthesize(Request())
                self.assertEqual(busy.exception.status_code, 429)
            finally:
                release.set()
            # Await the shielded background task without timing-dependent sleeps.
            pending = [task for task in asyncio.all_tasks()
                       if task is not asyncio.current_task() and not task.done()]
            await asyncio.gather(*pending)
        self.assertTrue(self.service.LOCK.acquire(blocking=False))
        self.service.LOCK.release()


if __name__ == "__main__":
    unittest.main()
