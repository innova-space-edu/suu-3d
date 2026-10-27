"""Authenticated, offline CPU Piper TTS for SUU.

Input: short Spanish JSON text. Output: WAV. No audio or text persistence.
"""
import asyncio
import io
import os
import secrets
import threading
import wave
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from piper import PiperVoice

TOKEN_FILE = Path(os.environ.get("PIPER_API_TOKEN_FILE", "/run/secrets/tts_api_key"))
TOKEN = TOKEN_FILE.read_text(encoding="utf-8").strip()
if len(TOKEN) < 32:
    raise RuntimeError("PIPER API token must contain at least 32 characters")

VOICE_NAME = "es_AR-daniela-high"
MODEL_PATH = Path(os.environ.get("PIPER_MODEL", f"/voices/{VOICE_NAME}.onnx"))
if not MODEL_PATH.is_file() or not Path(str(MODEL_PATH) + ".json").is_file():
    raise RuntimeError("Missing local ONNX voice/config. Run the private bootstrap.")
VOICE = PiperVoice.load(str(MODEL_PATH))
LOCK = threading.BoundedSemaphore(1)
MAX_TEXT = 700
MAX_AUDIO_BYTES = 3_000_000

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "piper", "voice": VOICE_NAME, "device": "cpu"}


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
        import json
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
    try:
        try:
            audio = await asyncio.to_thread(synthesize_wav, text)
        except Exception as exc:
            # Do not expose private text or traceback.
            raise HTTPException(status_code=503, detail="Síntesis local no disponible") from exc
        return Response(audio, media_type="audio/wav", headers={
            "Cache-Control": "private, no-store",
            "X-Suu-Voice-Provider": "dell-piper",
        })
    finally:
        LOCK.release()
