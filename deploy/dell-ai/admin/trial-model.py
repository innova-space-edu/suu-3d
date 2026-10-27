#!/usr/bin/env python3
"""Owner-run, bounded Qwen 4B trial and explicit activation/rollback.
No arbitrary host commands, no public ports, no secret output.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time
import urllib.request
import wave

ROOT = Path(__file__).resolve().parent
TARGET = Path.home() / "suu-ai"
MODEL = "Qwen3-4B-Instruct-2507-Q5_K_M.gguf"
REVISION = "ae44f08e1392f39c0e474af10c3ff8355c8b6688"
MODEL_SHA = "66713ce35a58a82fe87642d4ec13425bf9b9a46800fff5c49a665ef5701439dc"
MODEL_BYTES = 2889513696
URL = ("https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/"
       + REVISION + "/Qwen_Qwen3-4B-Instruct-2507-Q5_K_M.gguf")
ORIGINAL_COMPOSE_SHA = "c5d4bad2aa53b2553d790b58d2345a6027ca3ef7601c9e8ebd2d6efbb1a7cfc2"
GIB = 1024 ** 3
spec = importlib.util.spec_from_file_location("quality", ROOT / "benchmark-quality.py")
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)


def digest(path):
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def regular(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid():
        raise ValueError(f"Archivo no regular o ajeno al propietario: {path.name}")
    return path


def memory_available():
    for line in Path("/proc/meminfo").read_text().splitlines():
        if line.startswith("MemAvailable:"):
            return int(line.split()[1]) * 1024
    raise ValueError("No se pudo consultar MemAvailable")


def require_memory(available):
    # Five GiB candidate limit plus two GiB left for host/Piper headroom.
    if available < 7 * GIB:
        raise ValueError("El ensayo de 4B requiere al menos 7 GiB disponibles (5 GiB de límite y 2 de margen). No se cambia producción.")


def docker_command():
    if subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        return ["docker"]
    subprocess.run(["sudo", "-v"], check=True)
    return ["sudo", "docker"]


def docker(cmd, *args):
    return subprocess.check_output(cmd + list(args), text=True).strip()


def inspect(cmd, name):
    return json.loads(docker(cmd, "inspect", name))[0]


def wait_ready(cmd, name, port, token):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        state = inspect(cmd, name)["State"]
        if not state["Running"] or state.get("OOMKilled"):
            raise ValueError("El motor terminó o agotó memoria durante el arranque")
        try:
            request = urllib.request.Request(f"http://127.0.0.1:{port}/health",
                                             headers={"Authorization": "Bearer " + token})
            with urllib.request.urlopen(request, timeout=3) as response:
                if json.load(response).get("status") == "ok":
                    return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise TimeoutError("El motor no quedó listo en 180 segundos")


def private_json(path, value):
    with open(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)


def new_profile(text, image):
    if not re.fullmatch(r"ghcr\.io/ggml-org/llama\.cpp@sha256:[a-f0-9]{64}", image):
        raise ValueError("Digest de imagen no admitido")
    values = {"SUU_MODEL_FILE": MODEL, "SUU_LLM_MEMORY": "5g", "SUU_LLM_IMAGE": image}
    lines = [line for line in text.splitlines() if line.split("=", 1)[0].strip() not in values]
    return "\n".join(lines + [f"{key}={value}" for key, value in values.items()]) + "\n"


def download():
    model = TARGET / "models" / MODEL
    if model.exists():
        regular(model)
        if digest(model) != MODEL_SHA:
            raise ValueError("El candidato existente no coincide con SHA-256; no se sobrescribe")
        return
    if shutil.disk_usage(TARGET).free < MODEL_BYTES + GIB:
        raise ValueError("Falta espacio libre para el modelo y margen de descarga")
    partial = model.with_name(model.name + f".partial-{os.getpid()}-{time.time_ns()}")
    try:
        print("Descargando candidato fijado por revisión y SHA-256 (~2,89 GB)…", flush=True)
        with urllib.request.urlopen(URL, timeout=60) as source, open(os.open(partial, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as output:
            size = 0
            while chunk := source.read(4 * 1024 * 1024):
                size += len(chunk)
                if size > MODEL_BYTES:
                    raise ValueError("Descarga mayor que el archivo verificado")
                output.write(chunk)
        if partial.stat().st_size != MODEL_BYTES or digest(partial) != MODEL_SHA:
            raise ValueError("Tamaño o SHA-256 incorrecto")
        partial.rename(model)
    finally:
        if partial.exists():
            partial.unlink()


def suite(port, token, label, preset):
    rows = []
    for case, prompt, expected in quality.CASES:
        try:
            result = quality.completion(port, token, prompt, quality.PRESETS[preset])
            row = {"case": case, **result, "exact_match": None if expected is None else quality.normalized(result["answer"]) == expected}
        except Exception as error:
            row = {"case": case, "error": type(error).__name__, "exact_match": None if expected is None else False}
        rows.append(row)
        print(json.dumps({"model": label, **row}, ensure_ascii=False), flush=True)
    return rows


def voice_probe(token):
    key = Path.home() / "suu-tts/secrets/tts_api_key.txt"
    if not key.is_file():
        return {"skipped": "No se encontró Piper local"}
    tts_token = regular(key).read_text().strip()
    started = time.perf_counter()
    def synthesize(text):
        request = urllib.request.Request("http://127.0.0.1:8096/synthesize", data=json.dumps({"text": text}).encode(),
                                         headers={"Content-Type": "application/json", "Authorization": "Bearer " + tts_token})
        synthesis_start = time.perf_counter()
        with urllib.request.urlopen(request, timeout=45) as response:
            audio = response.read(3_000_001)
        if len(audio) > 3_000_000:
            raise ValueError("Audio excesivo")
        ready = time.perf_counter() - started
        with wave.open(io.BytesIO(audio), "rb") as wav:
            seconds = wav.getnframes() / wav.getframerate()
        return {"first_audio_ready_seconds": round(ready, 3),
                "piper_rtf": round((time.perf_counter() - synthesis_start) / max(seconds, .001), 3)}
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = []
        result = quality.completion(8095, token, "Explica en tres frases por qué los planetas orbitan alrededor del Sol.",
                                    quality.PRESETS["current"], lambda text: pending.append(pool.submit(synthesize, text)))
        measured = pending[0].result() if pending else {}
        return {**measured, "model_total_seconds": result["total_seconds"],
                "note": "Audio listo en Dell; no incluye Vercel, Cloudflare ni reproducción del navegador"}


def score(rows):
    expected = {case for case, _, answer in quality.CASES if answer is not None}
    scored = [row for row in rows if row.get("case") in expected]
    if len(scored) != len(expected) or {row["case"] for row in scored} != expected:
        raise ValueError("Evaluación incompleta o duplicada")
    return sum(row.get("exact_match") is True for row in scored)


def validate_compose():
    source = ROOT.parent / "compose.yaml"
    current = regular(TARGET / "compose.yaml")
    if digest(current) not in (ORIGINAL_COMPOSE_SHA, digest(source)):
        raise ValueError("Compose local personalizado: no se sobrescribe")
    return source


def compose_up(cmd):
    subprocess.run(cmd + ["compose", "--project-directory", str(TARGET), "-f", str(TARGET / "compose.yaml"),
                          "up", "-d", "--no-deps", "suu-llm"], check=True)


def restore(cmd, backup, token):
    backup = backup.resolve()
    if not backup.is_relative_to((TARGET / "backups").resolve()):
        raise ValueError("Respaldo fuera de la carpeta autorizada")
    for name in ("compose.yaml", ".env"):
        regular(backup / name)
    if digest(backup / "compose.yaml") not in (ORIGINAL_COMPOSE_SHA, digest(ROOT.parent / "compose.yaml")):
        raise ValueError("Compose de respaldo desconocido")
    for name in ("compose.yaml", ".env"):
        regular(TARGET / name)
        shutil.copy2(backup / name, TARGET / name)
    compose_up(cmd)
    wait_ready(cmd, "suu-llm", 8094, token)


def activate(cmd, report_path, token):
    report = json.loads(regular(report_path).read_text())
    candidate_score = score(report.get("candidate", []))
    if (report.get("candidate_sha") != MODEL_SHA or report.get("preset") != "current" or candidate_score < 9
            or candidate_score <= score(report.get("baseline", [])) or report.get("oom_killed")):
        raise ValueError("El candidato necesita al menos 9/10 coincidencias y superar al actual; revisar el informe antes de activar")
    probe = report.get("voice_probe", {})
    if ("error" in probe or "skipped" in probe or probe.get("model_total_seconds", 999) > 45
            or probe.get("piper_rtf", 999) >= 1):
        raise ValueError("Falta una prueba de voz correcta dentro del presupuesto de 45 segundos")
    require_memory(memory_available())
    model = regular(TARGET / "models" / MODEL)
    if digest(model) != MODEL_SHA:
        raise ValueError("El candidato cambió desde el ensayo")
    source = validate_compose()
    image = report["image_digest"]
    content = new_profile(regular(TARGET / ".env").read_text(), image)
    tested = docker(cmd, "image", "inspect", "--format", "{{.Id}}", image)
    if tested != report["image_id"]:
        raise ValueError("La imagen no coincide con la probada")
    env = regular(TARGET / ".env")
    backup = TARGET / "backups" / f"before-4b-{time.time_ns()}"
    backup.mkdir(mode=0o700, parents=True)
    for name in ("compose.yaml", ".env"):
        shutil.copy2(TARGET / name, backup / name)
    try:
        shutil.copy2(source, TARGET / "compose.yaml")
        env.write_text(content)
        compose_up(cmd)
        wait_ready(cmd, "suu-llm", 8094, token)
        quality.completion(8094, token, "Di solamente: SUU listo.", quality.PRESETS["qwen3-instruct"])
    except (Exception, KeyboardInterrupt):
        print("Falló el nuevo perfil; restaurando el anterior…", flush=True)
        restore(cmd, backup, token)
        raise
    print("Perfil 4B activo, alias suu-local y puerto 8094 conservados.")
    print("Respaldo:", backup)
    print("Reversión: python3 deploy/dell-ai/admin/trial-model.py --rollback", backup, "--apply")


@contextmanager
def candidate_container(cmd, image_id, token):
    name = f"suu-llm-candidate-{os.getpid()}-{time.time_ns()}"
    try:
        container = docker(cmd, "run", "-d", "--name", name, "--init", "--read-only", "--cap-drop", "ALL",
                           "--security-opt", "no-new-privileges:true", "--cpus", "2", "--memory", "5g", "--pids-limit", "150",
                           "--user", f"{os.getuid()}:{os.getgid()}", "--network", "portal_default", "-p", "127.0.0.1:8095:8080",
                           "-v", f"{TARGET / 'models'}:/models:ro", "-v", f"{TARGET / 'secrets/suu_api_key.txt'}:/run/secrets/suu_api_key:ro",
                           image_id, "--host", "0.0.0.0", "--port", "8080", "--model", f"/models/{MODEL}", "--alias", "suu-local",
                           "--ctx-size", "2048", "--threads", "2", "--parallel", "1", "--n-predict", "256",
                           "--reasoning", "off", "--no-webui", "--api-key-file", "/run/secrets/suu_api_key")
    except (Exception, KeyboardInterrupt):
        subprocess.run(cmd + ["rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raise
    try:
        wait_ready(cmd, container, 8095, token)
        yield container
    finally:
        subprocess.run(cmd + ["rm", "-f", container], check=True, stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--activate", type=Path)
    action.add_argument("--rollback", type=Path)
    args = parser.parse_args()
    if os.getuid() == 0:
        parser.error("Ejecutar como propietario, sin sudo delante de Python")
    if TARGET.is_symlink() or not TARGET.is_dir() or (TARGET / "models").is_symlink() or not (TARGET / "models").is_dir():
        raise ValueError("Falta la instalación existente ~/suu-ai")
    available = memory_available()
    print(json.dumps({"available_gib": round(available/GIB, 2), "candidate_limit_gib": 5,
                      "cpu_limit": 2, "model": MODEL, "port_trial": 8095}))
    if not args.apply:
        print("Previsualización. --apply descarga y compara sin activar; --activate INFORME --apply activa tras revisión.")
        return
    token = regular(TARGET / "secrets/suu_api_key.txt").read_text().strip()
    if len(token) < 16:
        raise ValueError("Clave local inválida")
    cmd = docker_command()
    if args.rollback:
        restore(cmd, args.rollback, token)
        print("Perfil anterior restaurado.")
        return
    if args.activate:
        activate(cmd, args.activate, token)
        return
    require_memory(available)
    with socket.socket() as check:
        check.bind(("127.0.0.1", 8095))
    current = inspect(cmd, "suu-llm")
    image_id = current["Image"]
    image_info = json.loads(docker(cmd, "image", "inspect", image_id))[0]
    digests = [value for value in image_info.get("RepoDigests", []) if re.fullmatch(r"ghcr\.io/ggml-org/llama\.cpp@sha256:[a-f0-9]{64}", value)]
    if not digests:
        raise ValueError("No hay digest verificable de la imagen actual")
    download()
    print("Evaluando modelo actual sin ayudas de SUU…", flush=True)
    baseline = suite(8094, token, "current", "current")
    require_memory(memory_available())
    with candidate_container(cmd, image_id, token) as container:
        print("Evaluando candidato 4B…", flush=True)
        candidate = suite(8095, token, "qwen3-4b-q5", "current")
        try:
            probe = voice_probe(token)
        except Exception as error:
            probe = {"error": type(error).__name__}
        print(json.dumps({"voice_probe": probe}, ensure_ascii=False))
        state = inspect(cmd, container)["State"]
        summary = {"candidate_sha": MODEL_SHA, "image_id": image_id, "image_digest": digests[0],
                   "baseline": baseline, "candidate": candidate, "voice_probe": probe,
                   "oom_killed": state.get("OOMKilled", False),
                   "resources": {"available_gib_before_trial": round(available / GIB, 2),
                                 "candidate_limit_gib": 5, "candidate_cpus": 2}, "preset": "current"}
        report = TARGET / f"model-trial-{time.time_ns()}.json"
        private_json(report, summary)
        print(json.dumps({"baseline_exact": score(baseline), "candidate_exact": score(candidate), "scored_cases": 10}))
        print("Informe:", report)
        print("Modelo de producción conservado. Revisar las respuestas abiertas y los tiempos.")
        print("Activación tras revisión: python3 deploy/dell-ai/admin/trial-model.py --activate", report, "--apply")


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        if isinstance(error, (ValueError, TimeoutError)):
            print("No completado:", str(error))
        else:
            print("No completado:", type(error).__name__, "(sin imprimir datos privados)")
        raise SystemExit(1)
