"""Authenticated, offline CPU Piper TTS for SUU.

Input: short Spanish JSON text. Output: WAV. No audio or text persistence.
"""
import asyncio
import io
import json
import os
import secrets
import threading
import time
import wave
from contextlib import asynccontextmanager
from pathlib import Path

import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Request, Response
from piper import PiperVoice
from piper.config import PiperConfig

TOKEN_FILE = Path(os.environ.get("PIPER_API_TOKEN_FILE", "/run/secrets/tts_api_key"))
TOKEN = TOKEN_FILE.read_text(encoding="utf-8").strip()
if len(TOKEN) < 32:
    raise RuntimeError("PIPER API token must contain at least 32 characters")

VOICE_NAME = "es_AR-daniela-high"
MODEL_PATH = Path(os.environ.get("PIPER_MODEL", f"/voices/{VOICE_NAME}.onnx"))
if not MODEL_PATH.is_file() or not Path(str(MODEL_PATH) + ".json").is_file():
    raise RuntimeError("Missing local ONNX voice/config. Run the private bootstrap.")
# OMP_NUM_THREADS does not configure ONNX Runtime's own thread pool.
# Match the one-core container quota; disable idle spinning so Piper does not
# compete with Qwen/STT while waiting. Construct exactly one persistent session.
THREADS = max(1, min(4, int(os.environ.get("PIPER_THREADS", "1"))))
OPTIONS = ort.SessionOptions()
OPTIONS.intra_op_num_threads = THREADS
OPTIONS.inter_op_num_threads = 1
OPTIONS.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
OPTIONS.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
OPTIONS.add_session_config_entry("session.intra_op.allow_spinning", "0")
OPTIONS.add_session_config_entry("session.inter_op.allow_spinning", "0")
VOICE = PiperVoice(
    config=PiperConfig.from_dict(json.loads(Path(str(MODEL_PATH) + ".json").read_text())),
    session=ort.InferenceSession(str(MODEL_PATH), sess_options=OPTIONS,
                                providers=["CPUExecutionProvider"]),
)
VOICE_NAME = MODEL_PATH.stem
LOCK = threading.BoundedSemaphore(1)
MAX_TEXT = 700
MAX_AUDIO_BYTES = 3_000_000

@asynccontextmanager
async def lifespan(_app):
    # Pay lazy phonemizer/graph initialization at startup, before readiness.
    await asyncio.to_thread(synthesize_wav, "Hola.")
    yield


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "piper", "voice": VOICE_NAME,
            "device": "cpu", "threads": THREADS, "optimized": True}


def synthesize_wav(text: str) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        VOICE.synthesize_wav(text, wav)
    result = output.getvalue()
    if not result.startswith(b"RIFF") or len(result) < 100:
        raise ValueError("Invalid synthesized WAV")
    if len(result) > MAX_AUDIO_BYTES:
        raise ValueError("Audio too long")
    return result


def synthesize_locked(text: str):
    # Cancellation of an HTTP request cannot stop native ONNX inference.
    # Keep the lock until the worker actually finishes, including on errors.
    started = time.perf_counter()
    try:
        audio = synthesize_wav(text)
        elapsed_ms = (time.perf_counter() - started) * 1000
        with wave.open(io.BytesIO(audio), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        return audio, elapsed_ms, duration
    finally:
        LOCK.release()


@app.post("/synthesize")
async def synthesize(request: Request):
    supplied = request.headers.get("authorization", "")
    if not secrets.compare_digest(supplied, "Bearer " + TOKEN):
        raise HTTPException(status_code=401, detail="No autorizado")
    declared = request.headers.get("content-length")
    if declared and (not declared.isdecimal() or int(declared) > 3500):
        raise HTTPException(status_code=413, detail="Solicitud demasiado grande")
    if request.headers.get("content-type", "").split(";", 1)[0].lower() != "application/json":
        raise HTTPException(status_code=415, detail="Se requiere JSON")
    body = await request.body()
    if len(body) > 3500:
        raise HTTPException(status_code=413, detail="Solicitud demasiado grande")
    try:
        data = json.loads(body)
        text = data.get("text") if isinstance(data, dict) else None
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="JSON inválido")
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= MAX_TEXT:
        raise HTTPException(status_code=400, detail="Texto vacío o excesivo")
    text = text.strip()
    if any(ord(c) < 32 and c not in "\n\t" for c in text):
        raise HTTPException(status_code=400, detail="Caracteres de control prohibidos")
    if not LOCK.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Motor de voz ocupado")
    task = asyncio.create_task(asyncio.to_thread(synthesize_locked, text))
    # Retrieve errors even if the HTTP client has already disconnected.
    task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
    try:
        audio, elapsed_ms, duration = await asyncio.shield(task)
    except Exception as exc:
        # Do not expose private text or traceback.
        raise HTTPException(status_code=503, detail="Síntesis local no disponible") from exc
    return Response(audio, media_type="audio/wav", headers={
            "Cache-Control": "private, no-store",
            "X-Suu-Voice-Provider": "dell-piper",
            "Server-Timing": f"piper-synthesis;dur={elapsed_ms:.1f}",
            "X-Suu-Audio-Seconds": f"{duration:.3f}",
            "X-Suu-Synthesis-Rtf": f"{elapsed_ms / max(duration * 1000, 1):.3f}",
        })
