#!/usr/bin/env python3
"""Evaluate the raw local model, without SUU's calculator/reference guards.
Uses only synthetic prompts; never prints the API key or hidden reasoning.
"""
import argparse
import datetime
import json
import os
import re
import statistics
import time
import unicodedata
import urllib.request
from pathlib import Path

CASES = [
    ("precedence", "Responde únicamente el número: 2*2+5", "9"),
    ("parentheses", "Responde únicamente el número: (2+3)*4", "20"),
    ("multiplication", "Responde únicamente el número: 7*8", "56"),
    ("fractions", "Responde únicamente la fracción: 1/3+1/6", "1/2"),
    ("mercury", "Responde solo el nombre del planeta más cercano al Sol.", "mercurio"),
    ("planet_count", "Responde únicamente el número de planetas del sistema solar.", "8"),
    ("sun", "Responde una palabra: ¿el Sol es estrella o planeta?", "estrella"),
    ("capital", "Responde solo el nombre de la capital de Francia.", "paris"),
    ("water", "Responde solo la fórmula química del agua.", "h2o"),
    ("browser", "Responde sí o no: ¿puedes controlar mi navegador desde este chat?", "no"),
    ("solar_open", "¿Qué me puedes decir sobre el sistema solar?", None),
    ("capabilities_open", "¿Qué puedes hacer?", None),
]
PRESETS = {
    "qwen3-instruct": {"temperature": .7, "top_p": .8, "top_k": 20, "min_p": 0.},
    "current": {"temperature": .4},
    # Official Qwen3.5-0.8B card: non-thinking text tasks. Evaluate; do not
    # activate these settings in production merely because they are published.
    "qwen-text": {"temperature": 1., "top_p": 1., "top_k": 20,
                  "min_p": 0., "presence_penalty": 2., "repeat_penalty": 1.},
}
SYSTEM = ("Eres SUU, asistente educativo. Responde en español de forma breve y precisa. "
          "No controlas el navegador, no tienes búsqueda web ni ejecutas acciones externas. "
          "Si no sabes algo, dilo. Máximo 45 palabras.")


def normalized(text):
    text = unicodedata.normalize("NFD", unicodedata.normalize("NFKC", text).lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.strip().rstrip(".").strip()


def completion(port, token, prompt, preset, on_phrase=None):
    data = {"model": "suu-local", "stream": True, "max_tokens": 96,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": prompt}], **preset}
    request = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions",
                                    data=json.dumps(data).encode(), headers={
                                        "Content-Type": "application/json", "Authorization": "Bearer " + token})
    started = time.perf_counter()
    first = phrase = None
    content = ""
    finished = False
    finish_reason = None
    with urllib.request.urlopen(request, timeout=120) as response:
        for line in response:
            if not line.startswith(b"data:"):
                continue
            payload = line[5:].strip()
            if payload == b"[DONE]":
                finished = True
                break
            event = json.loads(payload)
            if event.get("error"):
                raise ValueError("Provider stream error")
            choices = event.get("choices", [])
            if not choices:
                continue
            choice = choices[0]
            delta = choice.get("delta", {}).get("content")
            if isinstance(delta, str) and delta:
                elapsed = time.perf_counter() - started
                if first is None:
                    first = elapsed
                content += delta
                if phrase is None and (re.search(r".{20,}[.!?;:]\s", content) or len(content) > 60):
                    phrase = elapsed
                    if on_phrase:
                        front = content[:60]
                        cut = front.rfind(" ")
                        on_phrase(front[:cut] if cut >= 25 else front)
                if len(content) > 4500:
                    raise ValueError("Output too long")
            if choice.get("finish_reason"):
                finish_reason = choice["finish_reason"]
                finished = True
    elapsed = time.perf_counter() - started
    if not finished or not content.strip():
        raise ValueError("Incomplete or empty stream")
    if phrase is None and on_phrase:
        on_phrase(content)
    return {"answer": content, "finish_reason": finish_reason, "first_text_seconds": round(first, 3),
            "first_phrase_seconds": round(phrase if phrase is not None else elapsed, 3),
            "total_seconds": round(elapsed, 3)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8094)
    parser.add_argument("--preset", choices=["current", "qwen-text", "qwen3-instruct", "both"], default="both")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Invalid local port")
    token = (Path.home() / "suu-ai/secrets/suu_api_key.txt").read_text().strip()
    presets = {key: PRESETS[key] for key in ("current", "qwen-text")} if args.preset == "both" else {args.preset: PRESETS[args.preset]}
    rows = []
    for preset, settings in presets.items():
        for label, prompt, expected in CASES:
            try:
                result = completion(args.port, token, prompt, settings)
                row = {"preset": preset, "case": label, **result,
                       "exact_match": None if expected is None else normalized(result["answer"]) == expected}
            except Exception as error:
                row = {"preset": preset, "case": label, "error": type(error).__name__, "exact_match": None if expected is None else False}
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
    for preset in presets:
        selected = [row for row in rows if row["preset"] == preset]
        scored = [row for row in selected if row.get("exact_match") is not None]
        times = [row["total_seconds"] for row in selected if "total_seconds" in row]
        print(json.dumps({"preset": preset, "exact_matches": sum(row["exact_match"] for row in scored),
                          "scored_cases": len(scored), "median_seconds": statistics.median(times) if times else None}))
    report = Path.home() / "suu-ai" / ("model-quality-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S") + f"-{os.getpid()}.json")
    with open(os.open(report, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as output:
        json.dump(rows, output, ensure_ascii=False, indent=2)
    print("Informe:", report)
    print("Coincidencia exacta mide también formato; revisar las respuestas abiertas manualmente.")
    print("Evalúa el modelo directo. No prueba los guardas de SUU, Piper, Cloudflare o Vercel.")
    print("No cambia el modelo, sus pesos ni los ajustes de producción.")


if __name__ == "__main__":
    main()
