"""Private SUU phoneme forced-alignment adapter for Montreal Forced Aligner 3.x.
Run on trusted infrastructure with MFA, Spanish acoustic model, dictionary and ffmpeg.
Never bind this service publicly without a private reverse proxy and a bearer secret.
"""
import base64
import binascii
import json
import os
import subprocess
import tempfile
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="SUU acoustic phoneme aligner", docs_url=None, redoc_url=None)

class AlignRequest(BaseModel):
    audio: str = Field(min_length=200, max_length=11_000_000)
    mime: str = "audio/mpeg"
    text: str = Field(min_length=1, max_length=2000)
    language: str = "es-CL"

def extract_phones(payload):
    tiers = payload.get("tiers", {})
    rows = []
    if not isinstance(tiers, dict):
        return rows
    for name, value in tiers.items():
        if "phone" not in name.lower() or not isinstance(value, dict):
            continue
        for entry in value.get("entries", []):
            if not isinstance(entry, list) or len(entry) < 3:
                continue
            start, end, phone = entry[:3]
            if isinstance(phone, str) and len(phone) <= 16 and isinstance(start, (int, float)) and isinstance(end, (int, float)) and 0 <= start < end < 180:
                rows.append({"phone": phone, "start": float(start), "end": float(end)})
    return sorted(rows, key=lambda row: row["start"])[:2400]

@app.get("/healthz")
def health():
    return {"ok": bool(os.getenv("SUU_ALIGNER_TOKEN") and os.getenv("MFA_SPANISH_DICTIONARY") and os.getenv("MFA_SPANISH_ACOUSTIC"))}

@app.post("/align")
def align(req: AlignRequest, authorization: str | None = Header(None)):
    token = os.getenv("SUU_ALIGNER_TOKEN", "")
    if not token:
        raise HTTPException(503, "Alineador sin configurar")
    import hmac
    if not authorization or not hmac.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(401, "Sin autorización")
    if not req.language.lower().startswith("es") or req.mime != "audio/mpeg":
        raise HTTPException(422, "Solo está configurado el modelo español MP3")
    dictionary, acoustic = os.getenv("MFA_SPANISH_DICTIONARY"), os.getenv("MFA_SPANISH_ACOUSTIC")
    if not dictionary or not acoustic:
        raise HTTPException(503, "Faltan modelos MFA")
    try:
        raw = base64.b64decode(req.audio, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "Audio base64 inválido") from None
    if not 200 <= len(raw) <= 8_000_000:
        raise HTTPException(413, "Audio demasiado grande")
    with tempfile.TemporaryDirectory(prefix="suu-align-") as directory:
        root = Path(directory)
        source, wav, transcript, aligned = (root / name for name in ("voice.mp3", "voice.wav", "voice.txt", "aligned.json"))
        source.write_bytes(raw)
        transcript.write_text(req.text, encoding="utf-8")
        try:
            subprocess.run(["ffmpeg","-nostdin","-loglevel","error","-y","-i",str(source),"-t","90","-ac","1","-ar","16000",str(wav)],check=True,timeout=12,capture_output=True)
            subprocess.run(["mfa","align_one","--output_format","json","-j","1",str(wav),str(transcript),dictionary,acoustic,str(aligned)],check=True,timeout=35,capture_output=True)
        except (subprocess.TimeoutExpired,subprocess.CalledProcessError,FileNotFoundError):
            raise HTTPException(503, "Alineación acústica no disponible") from None
        if not aligned.is_file() or aligned.stat().st_size > 2_000_000:
            raise HTTPException(503, "MFA no devolvió alineación")
        try:
            phonemes = extract_phones(json.loads(aligned.read_text(encoding="utf-8")))
        except (ValueError, OSError):
            raise HTTPException(503, "Salida MFA ilegible") from None
        if not phonemes:
            raise HTTPException(503, "MFA no detectó fonemas")
        return {"phonemes": phonemes, "source": "mfa-acoustic-forced-alignment"}
