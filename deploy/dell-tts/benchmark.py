"""Run inside suu-tts: python /app/benchmark.py. Never prints the key or text."""
import io
import json
import os
import statistics
import sys
import time
import urllib.request
import wave
from pathlib import Path

token = Path(os.environ.get("PIPER_API_TOKEN_FILE", "/run/secrets/tts_api_key")).read_text().strip()
offline = "--offline" in sys.argv
if offline:
    from service import synthesize_wav, VOICE_NAME, THREADS, SPEAKER_ID
    synthesize_wav("Hola.")
    metadata = {"voice": VOICE_NAME, "threads": THREADS, "speaker_id": SPEAKER_ID}
else:
    with urllib.request.urlopen("http://127.0.0.1:8096/health", timeout=5) as health:
        state = json.load(health)
    metadata = {key: state.get(key) for key in ("voice", "threads", "speaker_id")}
phrases = [
    "Hola, soy SUU y estoy lista para ayudarte.",
    "Los paneles solares convierten la luz del sol en electricidad para alimentar los equipos del colegio.",
    "Podemos cuidar el medio ambiente usando energías renovables y reduciendo el consumo de electricidad en nuestras actividades diarias.",
]
results = []
for index, text in enumerate(phrases * 2):
    request = urllib.request.Request(
        "http://127.0.0.1:8096/synthesize",
        data=json.dumps({"text": text}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    started = time.perf_counter()
    if offline:
        audio = synthesize_wav(text)
    else:
        with urllib.request.urlopen(request, timeout=90) as response:
            audio = response.read()
    elapsed = time.perf_counter() - started
    with wave.open(io.BytesIO(audio), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    result = {"sample": index + 1, "characters": len(text),
              "synthesis_seconds": round(elapsed, 3), "audio_seconds": round(duration, 3),
              "rtf": round(elapsed / max(duration, .001), 3)}
    results.append(result)
    print(json.dumps(result), flush=True)
print(json.dumps({**metadata, "median_rtf": statistics.median(r["rtf"] for r in results),
                  "target": "RTF < 1; preferably < 0.5 for conversational headroom"}))
