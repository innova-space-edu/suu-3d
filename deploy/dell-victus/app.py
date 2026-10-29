"""SUU managed Victus relay v1: existing private Dell API -> fixed Ollama model."""
import asyncio
from contextlib import asynccontextmanager
import ipaddress
import json
import math
import os
from pathlib import Path
import secrets
import time
import uuid
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse


def validate_url(value):
    url = urlsplit(value)
    ip = ipaddress.ip_address(url.hostname)
    if (url.scheme != "http" or ip.version != 4 or ip not in ipaddress.ip_network("100.64.0.0/10")
            or url.port != 11434 or url.path not in ("", "/") or url.username or url.password or url.query or url.fragment):
        raise ValueError("Victus URL must be private Tailscale HTTP on port 11434")
    return f"http://{ip}:11434"


def parse_input(data):
    if not isinstance(data, dict):
        raise HTTPException(400, "Solicitud invalida")
    messages = data.get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 30:
        raise HTTPException(400, "Conversacion invalida")
    for message in messages:
        if (not isinstance(message, dict) or message.get("role") not in ("system", "user", "assistant")
                or not isinstance(message.get("content"), str) or len(message["content"]) > 30000):
            raise HTTPException(400, "Mensaje invalido")
    maximum, temperature = data.get("max_tokens", 96), data.get("temperature", .4)
    if type(maximum) is not int or not 1 <= maximum <= 256:
        raise HTTPException(400, "Limite de salida invalido")
    if type(temperature) not in (int, float) or not math.isfinite(temperature) or not 0 <= temperature <= 2:
        raise HTTPException(400, "Muestreo invalido")
    if type(data.get("stream", False)) is not bool:
        raise HTTPException(400, "Modo de respuesta invalido")
    return [{"role": item["role"], "content": item["content"]} for item in messages], maximum, temperature


def create_app(token, url, model="suu-victus-4b-q4", transport=None):
    if len(token) < 16:
        raise ValueError("Missing private Dell API token")
    url = validate_url(url)
    if model != "suu-victus-4b-q4":
        raise ValueError("Unexpected Victus model")
    gate = asyncio.Semaphore(1)

    @asynccontextmanager
    async def lifespan(app):
        app.state.ready = False
        async with httpx.AsyncClient(base_url=url, trust_env=False, transport=transport,
            timeout=httpx.Timeout(60, connect=4), limits=httpx.Limits(max_connections=2)) as client:
            app.state.client = client
            try:
                response = await client.post("/api/generate", json={"model": model, "keep_alive": -1, "stream": False})
                response.raise_for_status()
                app.state.ready = response.json().get("done") is True
            except Exception:
                pass  # Health remains unavailable; owner installer preserves the old engine.
            app.state.warmup_complete = True
            yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authorize(request):
        if not secrets.compare_digest(request.headers.get("authorization", "").encode(), ("Bearer " + token).encode()):
            raise HTTPException(401, "No autorizado")

    @app.get("/health")
    async def health():
        return JSONResponse({"status": "ok" if app.state.ready else "unavailable", "backend": "victus",
                             "model": model, "keep_alive": -1, "warmup_complete": app.state.warmup_complete}, status_code=200 if app.state.ready else 503)

    @app.get("/v1/models")
    async def models(request: Request):
        authorize(request)
        return {"object": "list", "data": [{"id": "suu-local", "object": "model", "owned_by": "suu"}]}

    @app.post("/v1/chat/completions")
    async def chat(request: Request):
        authorize(request)
        if not request.headers.get("content-type", "").startswith("application/json"):
            raise HTTPException(415, "Se requiere JSON")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 95000:
                raise HTTPException(413, "Solicitud excesiva")
        try:
            data = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            raise HTTPException(400, "JSON invalido") from None
        messages, maximum, temperature = parse_input(data)
        try:
            await asyncio.wait_for(gate.acquire(), .5)
        except asyncio.TimeoutError:
            raise HTTPException(429, "Motor ocupado") from None
        payload = {"model": model, "messages": messages, "stream": data.get("stream", False), "keep_alive": -1,
                   "options": {"num_ctx": 2048, "num_predict": maximum, "temperature": temperature, "num_thread": 4}}
        client = app.state.client
        upstream = None
        try:
            upstream = await client.send(client.build_request("POST", "/api/chat", json=payload), stream=True)
            upstream.raise_for_status()
        except asyncio.CancelledError:
            try:
                if upstream is not None:
                    await upstream.aclose()
            finally:
                gate.release()
            raise
        except Exception:
            app.state.ready = False
            try:
                if upstream is not None:
                    await upstream.aclose()
            finally:
                gate.release()
            raise HTTPException(503, "Victus no disponible") from None
        completion_id, created = "chatcmpl-" + uuid.uuid4().hex, int(time.time())
        base = {"id": completion_id, "created": created, "model": "suu-local"}
        headers = {"X-SUU-Backend": "victus", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"}

        released = False
        async def close_upstream():
            nonlocal released
            if released:
                return
            released = True
            try:
                await upstream.aclose()
            finally:
                gate.release()

        if not payload["stream"]:
            try:
                raw = await upstream.aread()
                if len(raw) > 100000:
                    raise ValueError("Excess response")
                result = json.loads(raw)
                answer = result.get("message", {}).get("content")
                if result.get("done") is not True or not isinstance(answer, str) or not answer.strip() or len(answer) > 12000:
                    raise ValueError("Incomplete response")
                app.state.ready = True
                return JSONResponse({**base, "object": "chat.completion", "choices": [{"index": 0,
                    "message": {"role": "assistant", "content": answer},
                    "finish_reason": "length" if result.get("done_reason") == "length" else "stop"}]}, headers=headers)
            except Exception:
                app.state.ready = False
                raise HTTPException(502, "Respuesta Victus incompleta") from None
            finally:
                await close_upstream()

        async def events():
            complete, length = False, 0
            try:
                async for line in upstream.aiter_lines():
                    if not line.strip():
                        continue
                    if len(line) > 65536:
                        raise ValueError("Excess event")
                    item = json.loads(line)
                    if item.get("error"):
                        raise ValueError("Upstream error")
                    text = item.get("message", {}).get("content", "")
                    if not isinstance(text, str):
                        raise ValueError("Invalid event")
                    if text:
                        length += len(text)
                        if length > 12000:
                            raise ValueError("Excess response")
                        yield "data: " + json.dumps({**base, "object": "chat.completion.chunk", "choices": [
                            {"index": 0, "delta": {"content": text}, "finish_reason": None}]}, ensure_ascii=False) + "\n\n"
                    if item.get("done") is True:
                        if not length:
                            raise ValueError("Empty response")
                        complete = True
                        app.state.ready = True
                        yield "data: " + json.dumps({**base, "object": "chat.completion.chunk", "choices": [
                            {"index": 0, "delta": {}, "finish_reason": "length" if item.get("done_reason") == "length" else "stop"}]}) + "\n\n"
                        yield "data: [DONE]\n\n"
                        break
                if not complete:
                    raise ValueError("Truncated response")
            except Exception:
                app.state.ready = False
                yield 'data: {"error":{"message":"Se interrumpio la respuesta del Victus"}}\n\n'
            finally:
                await close_upstream()
        class ReplyStream(StreamingResponse):
            async def __call__(self, scope, receive, send):
                try:
                    await super().__call__(scope, receive, send)
                finally:
                    # Also closes a response cancelled before its iterator starts.
                    await close_upstream()
        return ReplyStream(events(), media_type="text/event-stream", headers=headers)
    return app


def from_env():
    return create_app(Path(os.environ.get("SUU_API_TOKEN_FILE", "/run/secrets/suu_api_key")).read_text().strip(),
                      os.environ["SUU_VICTUS_URL"], os.environ.get("SUU_VICTUS_MODEL", "suu-victus-4b-q4"))
