#!/usr/bin/env python3
"""Prueba local de llama.cpp SUU, sin exponer el token en línea de comandos.

Desde el Dell: python3 admin/verify-suu.py
No modifica Docker, MCP, Cloudflare ni credenciales.
"""
import json
import time
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8094"
KEY_FILE = Path.home() / "suu-ai/secrets/suu_api_key.txt"
MODEL = "suu-local"

def request(path, token, data=None, timeout=120):
    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)

def unpack_completion(reply):
    choices = reply.get("choices") if isinstance(reply, dict) else None
    if not isinstance(choices, list) or not choices:
        return "", "missing_choices", 0, 0
    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message") if isinstance(first.get("message"), dict) else {}
    content = message.get("content")
    reasoning = message.get("reasoning_content")
    usage = reply.get("usage") if isinstance(reply.get("usage"), dict) else {}
    return (
        content if isinstance(content, str) else "",
        str(first.get("finish_reason", "unknown")),
        len(reasoning) if isinstance(reasoning, str) else 0,
        usage.get("completion_tokens", 0),
    )


def main():
    try:
        token = KEY_FILE.read_text(encoding="utf-8").strip()
        if not token:
            raise ValueError("La clave local está vacía")
        models = request("/v1/models", token, timeout=20)
        identifiers = [x.get("id", "") for x in models.get("data", [])
                       if isinstance(x, dict)]
        print("API local: accesible; modelos:", ", ".join(identifiers) or "(sin nombres)")
        start = time.monotonic()
        reply = request(
            "/v1/chat/completions",
            token,
            {"model": MODEL,
             "messages": [
                 {"role": "system", "content": "Eres SUU. Responde brevemente en español."},
                 {"role": "user", "content": "Di solamente: SUU listo."}
             ],
             "max_tokens": 192, "temperature": 0.7, "stream": False},
            timeout=150)
        elapsed = round(time.monotonic() - start, 2)
        answer, finish_reason, reasoning_chars, generated = unpack_completion(reply)
        print("Generación:", {"finish_reason": finish_reason,
                              "tokens_generados": generated,
                              "caracteres_razonamiento": reasoning_chars,
                              "duracion_segundos": elapsed})
        if not answer.strip():
            print("Contenido visible vacío. No se imprime el razonamiento.")
            print("Si finish_reason=length, se agotó el presupuesto de tokens.")
            print("Revisar configuración --reasoning off y registros del contenedor.")
            return 1
        print("Modelo respondió (primeros 180 caracteres):", answer[:180])
        print("La inferencia local funciona. Esto NO prueba Cloudflare ni Vercel.")
        return 0
    except FileNotFoundError:
        print("No existe la clave en", KEY_FILE)
    except urllib.error.HTTPError as exc:
        print("API respondió con HTTP", exc.code, "(verificar clave/estado)")
    except urllib.error.URLError as exc:
        print("API local no accesible:", type(exc.reason).__name__)
    except (ValueError, KeyError, IndexError) as exc:
        print("Error de validación:", type(exc).__name__)
    except TimeoutError:
        print("La inferencia excedió el límite de 120 segundos")
    return 1

if __name__ == "__main__":
    sys.exit(main())
