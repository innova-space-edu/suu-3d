"""Private CPU speech-to-text API for SUU. Never logs audio or transcripts."""
import asyncio
import io
import os
import secrets
import threading
import time
from pathlib import Path

import av
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MAX_AUDIO_BYTES = 2_500_000
MAX_AUDIO_SECONDS = 17.0
FORMATS = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"}
LANGUAGES = {"es", "en", "pt", "fr"}
TOKEN = Path(os.environ.get("STT_API_TOKEN_FILE", "/run/secrets/stt_api_key")).read_text().strip()
if len(TOKEN) < 32:
    raise RuntimeError("Se requiere un token STT privado de 32+ caracteres")
MODEL = WhisperModel(os.environ.get("STT_MODEL", "base"), device="cpu",
                     compute_type="int8", cpu_threads=2, num_workers=1,
                     download_root="/models", local_files_only=True)
LOCK = threading.BoundedSemaphore(1)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    return {"status": "ok", "model": "base", "device": "cpu"}


def duration_seconds(payload: bytes) -> float:
    """Decode only to enforce a hard audio-duration cap before inference."""
    try:
        with av.open(io.BytesIO(payload)) as container:
            audio_streams = container.streams.audio
            if not audio_streams:
                raise ValueError("no audio")
            stream = audio_streams[0]
            seconds = 0.0
            for frame in container.decode(stream):
                seconds += frame.samples / frame.sample_rate
                if seconds > MAX_AUDIO_SECONDS:
                    raise HTTPException(status_code=413, detail="Audio demasiado largo")
            if seconds < 0.25:
                raise ValueError("too short")
            return seconds
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Audio inválido") from exc


def transcribe_in_worker(audio: bytes, language: str):
    """Keep Uvicorn responsive to health checks during CPU inference."""
    duration = duration_seconds(audio)
    started = time.monotonic()
    try:
        segments, _ = MODEL.transcribe(io.BytesIO(audio), language=language,
                                      beam_size=1, best_of=1,
                                      condition_on_previous_text=False,
                                      vad_filter=False, temperature=0)
        text = " ".join(segment.text.strip() for segment in segments).strip()[:3000]
    except Exception as exc:
        raise HTTPException(status_code=422, detail="No se pudo transcribir audio") from exc
    return JSONResponse({"text": text, "language": language,
                         "audio_seconds": round(duration, 2),
                         "elapsed_ms": round((time.monotonic() - started) * 1000)},
                        headers={"Cache-Control": "no-store"})


@app.post("/transcribe")
async def transcribe(request: Request):
    expected = "Bearer " + TOKEN
    actual = request.headers.get("authorization", "")
    if not secrets.compare_digest(actual, expected):
        raise HTTPException(status_code=401, detail="No autorizado")
    declared = request.headers.get("content-length")
    if declared and (not declared.isdecimal() or int(declared) > MAX_AUDIO_BYTES):
        raise HTTPException(status_code=413, detail="Audio demasiado grande")
    media_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if media_type not in FORMATS:
        raise HTTPException(status_code=415, detail="Formato de audio no admitido")
    language = request.headers.get("x-suu-language", "es").lower()
    if language not in LANGUAGES:
        raise HTTPException(status_code=400, detail="Idioma no permitido")
    if not LOCK.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Transcriptor ocupado")
    try:
        audio = await request.body()
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio vacío o demasiado grande")
        return await asyncio.to_thread(transcribe_in_worker, audio, language)
    finally:
        LOCK.release()
