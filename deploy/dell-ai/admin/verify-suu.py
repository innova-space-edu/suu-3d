#!/usr/bin/env python3
"""Prueba local de llama.cpp SUU, sin exponer el token en línea de comandos.

Desde el Dell: python3 admin/verify-suu.py
No modifica Docker, MCP, Cloudflare ni credenciales.
"""
import json
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

def main():
    try:
        token = KEY_FILE.read_text(encoding="utf-8").strip()
        if not token:
            raise ValueError("La clave local está vacía")
        models = request("/v1/models", token, timeout=20)
        identifiers = [x.get("id", "") for x in models.get("data", [])
                       if isinstance(x, dict)]
        print("API local: accesible; modelos:", ", ".join(identifiers) or "(sin nombres)")
        reply = request(
            "/v1/chat/completions",
            token,
            {"model": MODEL,
             "messages": [{"role": "user", "content": "Di solamente: SUU listo."}],
             "max_tokens": 48, "temperature": 0},
            timeout=120)
        choices = reply.get("choices", [])
        text = (choices[0].get("message", {}).get("content", "")
                if choices else "")
        if not text.strip():
            print("Respuesta vacía: revisar stdout/logs del servidor")
            return 1
        print("Modelo respondió (primeros 180 caracteres):", text[:180])
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
