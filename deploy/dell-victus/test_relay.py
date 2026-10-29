import asyncio
import importlib.util
import json
from pathlib import Path
import unittest

import httpx
from fastapi.testclient import TestClient

spec = importlib.util.spec_from_file_location("relay", Path(__file__).with_name("app.py"))
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)
TOKEN = "synthetic-private-token-123456789"
URL = "http://100.98.233.4:11434"
HEADERS = {"Authorization": "Bearer " + TOKEN}
INPUT = {"model": "suu-local", "messages": [{"role": "user", "content": "synthetic"}], "max_tokens": 96}


class Chunks(httpx.AsyncByteStream):
    def __init__(self, rows):
        self.rows, self.closed = rows, False
    async def __aiter__(self):
        for row in self.rows:
            yield (json.dumps(row, ensure_ascii=False) + "\n").encode()
    async def aclose(self):
        self.closed = True


class RelayTests(unittest.TestCase):
    def client(self, mode="normal"):
        self.requests, self.streams = [], []
        def handler(request):
            self.requests.append(request)
            if mode == "offline":
                raise httpx.ConnectError("synthetic offline")
            if request.url.path == "/api/generate":
                return httpx.Response(200, json={"done": True})
            body = json.loads(request.content)
            if mode == "bad-status":
                stream = Chunks([])
                self.streams.append(stream)
                return httpx.Response(500, stream=stream)
            if not body["stream"]:
                return httpx.Response(200, json={"done": True, "message": {"content": "Hola, energía."}})
            rows = [{"message": {"thinking": "never speak this", "content": "Hola, energía."}, "done": False}]
            if mode != "truncated":
                rows.append({"message": {"content": ""}, "done": True, "done_reason": "stop"})
            stream = Chunks(rows)
            self.streams.append(stream)
            return httpx.Response(200, stream=stream)
        return TestClient(relay.create_app(TOKEN, URL, transport=httpx.MockTransport(handler)))

    def test_authentication_and_bounds_never_forward_invalid_requests(self):
        with self.client() as client:
            self.assertEqual(client.post("/v1/chat/completions", json=INPUT).status_code, 401)
            self.assertEqual(client.post("/v1/chat/completions", json={**INPUT, "max_tokens": 1000}, headers=HEADERS).status_code, 400)
            self.assertEqual(client.post("/v1/chat/completions", content=b"x" * 95001, headers={**HEADERS, "Content-Type": "application/json"}).status_code, 413)
            self.assertEqual(len(self.requests), 1)  # Warmup only.

    def test_json_mapping_keeps_alias_and_never_forwards_dell_secret(self):
        with self.client() as client:
            self.assertEqual(client.get("/health").json()["backend"], "victus")
            response = client.post("/v1/chat/completions", json=INPUT, headers=HEADERS)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["X-SUU-Backend"], "victus")
            self.assertEqual(response.json()["choices"][0]["message"]["content"], "Hola, energía.")
            payload = json.loads(self.requests[-1].content)
            self.assertEqual(payload["model"], "suu-victus-4b-q4")
            self.assertEqual(payload["keep_alive"], -1)
            self.assertEqual(payload["options"]["num_predict"], 96)
            self.assertNotIn("authorization", self.requests[-1].headers)
            self.assertNotIn(TOKEN, self.requests[-1].content.decode())

    def test_stream_is_openai_utf8_and_does_not_expose_reasoning(self):
        with self.client() as client:
            response = client.post("/v1/chat/completions", json={**INPUT, "stream": True}, headers=HEADERS)
            self.assertIn("text/event-stream", response.headers["content-type"])
            self.assertIn("Hola, energía.", response.text)
            self.assertNotIn("never speak", response.text)
            self.assertTrue(response.text.endswith("data: [DONE]\n\n"))
            self.assertTrue(self.streams[-1].closed)

    def test_truncated_stream_has_error_not_fake_done_and_releases_gate(self):
        with self.client("truncated") as client:
            for _ in range(2):
                response = client.post("/v1/chat/completions", json={**INPUT, "stream": True}, headers=HEADERS)
                self.assertIn('"error"', response.text)
                self.assertNotIn("[DONE]", response.text)
            self.assertTrue(all(stream.closed for stream in self.streams))

    def test_unavailable_victus_returns_service_error_without_switching_models(self):
        with self.client("offline") as client:
            self.assertEqual(client.get("/health").status_code, 503)
            for _ in range(2):
                self.assertEqual(client.post("/v1/chat/completions", json=INPUT, headers=HEADERS).status_code, 503)
            self.assertTrue(all(json.loads(request.content)["model"] == "suu-victus-4b-q4" for request in self.requests))

    def test_upstream_http_errors_close_connections_before_releasing_turn(self):
        with self.client("bad-status") as client:
            for _ in range(3):
                response = client.post("/v1/chat/completions", json=INPUT, headers=HEADERS)
                self.assertEqual(response.status_code, 503)
            self.assertTrue(all(stream.closed for stream in self.streams))

    def test_url_rejects_non_tailnet_and_credentials(self):
        for url in ("http://example.com", "https://100.98.233.4:11434", "http://user:secret@100.98.233.4:11434", "http://100.98.233.4:11434/other"):
            with self.assertRaises(ValueError):
                relay.create_app(TOKEN, url)


class RelayAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_while_waiting_for_upstream_headers_releases_gate(self):
        waiting = asyncio.Event()
        calls = 0
        async def handler(request):
            nonlocal calls
            if request.url.path == "/api/generate":
                return httpx.Response(200, json={"done": True})
            calls += 1
            if calls == 1:
                waiting.set()
                await asyncio.Event().wait()
            return httpx.Response(200, json={"done": True, "message": {"content": "Hola"}})
        app = relay.create_app(TOKEN, URL, transport=httpx.MockTransport(handler))
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
                task = asyncio.create_task(client.post("/v1/chat/completions", json=INPUT, headers=HEADERS))
                await asyncio.wait_for(waiting.wait(), 2)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                result = await client.post("/v1/chat/completions", json=INPUT, headers=HEADERS)
                self.assertEqual(result.status_code, 200)

    async def test_disconnect_at_headers_closes_unstarted_stream_and_releases_turn(self):
        disconnected, closed = asyncio.Event(), asyncio.Event()
        class Stream(httpx.AsyncByteStream):
            async def __aiter__(self):
                await asyncio.Event().wait()
                yield b"never"
            async def aclose(self):
                closed.set()
        def handler(request):
            if request.url.path == "/api/generate":
                return httpx.Response(200, json={"done": True})
            if not json.loads(request.content)["stream"]:
                return httpx.Response(200, json={"done": True, "message": {"content": "Hola"}})
            return httpx.Response(200, stream=Stream())
        app = relay.create_app(TOKEN, URL, transport=httpx.MockTransport(handler))
        received = False
        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": json.dumps({**INPUT, "stream": True}).encode()}
            await disconnected.wait()
            return {"type": "http.disconnect"}
        async def send(event):
            if event["type"] == "http.response.start":
                disconnected.set()
                await asyncio.sleep(0)
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                 "scheme": "http", "path": "/v1/chat/completions", "raw_path": b"/v1/chat/completions", "query_string": b"",
                 "headers": [(b"authorization", ("Bearer " + TOKEN).encode()), (b"content-type", b"application/json")],
                 "server": ("test", 80), "client": ("test", 123)}
        async with app.router.lifespan_context(app):
            await asyncio.wait_for(app(scope, receive, send), 2)
            self.assertTrue(closed.is_set())
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
                result = await client.post("/v1/chat/completions", json=INPUT, headers=HEADERS)
                self.assertEqual(result.status_code, 200)

    async def test_first_sse_is_sent_before_native_stream_finishes(self):
        first, release, closed = asyncio.Event(), asyncio.Event(), asyncio.Event()
        class Stream(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'{"message":{"content":"Hola"},"done":false}\n'
                await release.wait()
                yield b'{"message":{"content":""},"done":true}\n'
            async def aclose(self):
                closed.set()
        def handler(request):
            if request.url.path == "/api/generate":
                return httpx.Response(200, json={"done": True})
            return httpx.Response(200, stream=Stream())
        app = relay.create_app(TOKEN, URL, transport=httpx.MockTransport(handler))
        body, received = json.dumps({**INPUT, "stream": True}).encode(), False
        output = []
        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": body}
            await asyncio.Event().wait()
        async def send(event):
            if event["type"] == "http.response.body":
                output.append(event.get("body", b""))
                if b"Hola" in event.get("body", b""):
                    first.set()
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                 "scheme": "http", "path": "/v1/chat/completions", "raw_path": b"/v1/chat/completions", "query_string": b"",
                 "headers": [(b"authorization", ("Bearer " + TOKEN).encode()), (b"content-type", b"application/json")],
                 "server": ("test", 80), "client": ("test", 123)}
        async with app.router.lifespan_context(app):
            task = asyncio.create_task(app(scope, receive, send))
            await asyncio.wait_for(first.wait(), 2)
            self.assertFalse(task.done())
            release.set()
            await asyncio.wait_for(task, 2)
        self.assertTrue(closed.is_set())
        self.assertIn(b"[DONE]", b"".join(output))


if __name__ == "__main__":
    unittest.main()
