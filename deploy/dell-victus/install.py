#!/usr/bin/env python3
"""Owner-run authenticated Dell relay activation, candidate test and rollback."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request

SOURCE = Path(__file__).resolve().parent
TARGET = Path.home() / "suu-ai"
MARKER = "# SUU managed Victus relay v1\n"
OLD_SHAS = {"c5d4bad2aa53b2553d790b58d2345a6027ca3ef7601c9e8ebd2d6efbb1a7cfc2",
            "a07a72d5df19f80b2729bd47b6b3d218625b469c12da6c69218a21f20cba8137"}
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def regular(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid():
        raise ValueError("Archivo no regular o ajeno al propietario: " + path.name)
    return path


def validate_url(value):
    # Share the exact relay validation without importing its optional host dependencies.
    match = re.fullmatch(r"http://(100\.(\d+)\.(\d+)\.(\d+)):11434/?", value)
    if not match or not 64 <= int(match[2]) <= 127 or not all(0 <= int(match[i]) <= 255 for i in (3, 4)):
        raise ValueError("URL Victus debe ser HTTP Tailscale IPv4 en puerto 11434")
    return "http://" + match[1] + ":11434"


def render(image, url):
    if not re.fullmatch(r"suu-victus-relay:[a-f0-9]{16}", image):
        raise ValueError("Imagen de puente no admitida")
    return (SOURCE / "compose.yaml").read_text().replace("__IMAGE__", image).replace("__VICTUS_URL__", validate_url(url))


def validate_current():
    current = regular(TARGET / "compose.yaml")
    original = SOURCE.parent / "dell-ai/compose.yaml"
    if sha(current) in OLD_SHAS | {sha(original)}:
        return
    text = current.read_text()
    image = re.search(r"^    image: (suu-victus-relay:[a-f0-9]{16})$", text, re.M)
    url = re.search(r"^      SUU_VICTUS_URL: (\S+)$", text, re.M)
    if not image or not url or text != render(image[1], url[1]):
        raise ValueError("Compose personalizado: se conserva sin cambios")


def docker_command():
    if subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        return ["docker"]
    subprocess.run(["sudo", "-v"], check=True)
    return ["sudo", "docker"]


def up(cmd):
    subprocess.run(cmd + ["compose", "--project-directory", str(TARGET), "-f", str(TARGET / "compose.yaml"),
                          "up", "-d", "--no-deps", "suu-llm"], check=True)


def wait_health(port, cmd=None, name=None):
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        if cmd and name:
            state = subprocess.check_output(cmd + ["inspect", "--format", "{{.State.Status}}", name], text=True).strip()
            if state not in ("running", "restarting", "created"):
                raise ValueError("El contenedor termino durante el arranque")
        try:
            with OPENER.open(f"http://127.0.0.1:{port}/health", timeout=3) as response:
                result = json.load(response)
            if result.get("status") == "ok":
                return result
        except urllib.error.HTTPError as error:
            try:
                failure = json.loads(error.read(4096))
            except ValueError:
                failure = {}
            if failure.get("backend") == "victus" and failure.get("warmup_complete"):
                raise ValueError("El contenedor no pudo precargar el modelo del Victus; revisar conectividad Tailscale/modelo") from None
        except OSError:
            pass
        time.sleep(2)
    raise TimeoutError("No quedo listo el servicio en 150 segundos")


def smoke(port, token):
    # Exercise the same OpenAI SSE path consumed by Vercel; token never goes to stdout.
    data = {"model": "suu-local", "stream": True, "max_tokens": 32, "temperature": .4,
            "messages": [{"role": "user", "content": "Responde brevemente en espanol: que es una estrella?"}]}
    request = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    answer, finished = "", False
    with OPENER.open(request, timeout=45) as response:
        if response.headers.get("X-SUU-Backend") != "victus":
            raise ValueError("La prueba no respondio desde el puente Victus")
        for line in response:
            if not line.startswith(b"data:"):
                continue
            raw = line[5:].strip()
            if raw == b"[DONE]":
                finished = True
                break
            event = json.loads(raw)
            if event.get("error"):
                raise ValueError("El stream de prueba fue interrumpido")
            answer += event.get("choices", [{}])[0].get("delta", {}).get("content", "")
    if not finished or not answer.strip():
        raise ValueError("Prueba SSE incompleta")


def restore(cmd, backup):
    backup = backup.resolve()
    if not backup.is_relative_to((TARGET / "backups").resolve()):
        raise ValueError("Respaldo fuera de la carpeta autorizada")
    manifest = json.loads(regular(backup / "manifest.json").read_text())
    saved = regular(backup / "compose.yaml")
    if sha(saved) != manifest["compose_sha"]:
        raise ValueError("Respaldo modificado")
    if sha(regular(TARGET / ".env")) != manifest["env_sha"]:
        raise ValueError("El entorno cambio desde el respaldo; revisar antes de restaurar")
    shutil.copy2(saved, regular(TARGET / "compose.yaml"))
    up(cmd)
    wait_health(8094)


def activate(cmd, content, token):
    backup = TARGET / "backups" / f"before-victus-relay-{time.time_ns()}"
    backup.mkdir(mode=0o700, parents=True)
    saved = regular(TARGET / "compose.yaml")
    shutil.copy2(saved, backup / "compose.yaml")
    manifest = {"compose_sha": sha(saved), "env_sha": sha(regular(TARGET / ".env"))}
    (backup / "manifest.json").write_text(json.dumps(manifest))
    os.chmod(backup / "manifest.json", 0o600)
    try:
        saved.write_text(content)
        up(cmd)
        result = wait_health(8094, cmd, "suu-llm")
        if result.get("backend") != "victus":
            raise ValueError("El servicio activo no es el puente Victus")
        smoke(8094, token)
    except (Exception, KeyboardInterrupt):
        try:
            print("Fallo la activacion; restaurando el motor anterior…", flush=True)
        except OSError:
            pass
        restore(cmd, backup)
        raise
    print("Activo: Dell autenticado -> Victus 4B; Piper permanece en Dell.")
    print("Respaldo:", backup)
    print("Reversion: python3 deploy/dell-victus/install.py --rollback", shlex.quote(str(backup)), "--apply")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--victus-url", default="http://100.98.233.4:11434")
    parser.add_argument("--rollback", type=Path)
    args = parser.parse_args()
    if os.getuid() == 0:
        parser.error("Ejecutar como propietario, sin sudo delante de Python")
    if TARGET.is_symlink() or not TARGET.is_dir():
        raise ValueError("Falta la instalacion existente ~/suu-ai")
    url = validate_url(args.victus_url)
    print(json.dumps({"gateway": "127.0.0.1:8094", "victus": url, "model": "suu-victus-4b-q4", "keep_alive": -1}))
    if not args.apply:
        print("Previsualizacion; --apply prueba un candidato y activa con respaldo y reversion.")
        return
    cmd = docker_command()
    if args.rollback:
        restore(cmd, args.rollback)
        print("Motor anterior restaurado.")
        return
    validate_current()
    env = dict(line.split("=", 1) for line in regular(TARGET / ".env").read_text().splitlines() if "=" in line and not line.startswith("#"))
    if env.get("SUU_RUN_UID") != str(os.getuid()) or env.get("SUU_RUN_GID") != str(os.getgid()):
        raise ValueError("UID/GID del entorno no coinciden con el propietario")
    token = regular(TARGET / "secrets/suu_api_key.txt").read_text().strip()
    if len(token) < 16:
        raise ValueError("Clave local invalida")
    with socket.socket() as port:
        try:
            port.bind(("127.0.0.1", 8097))
        except OSError:
            raise ValueError("Puerto de ensayo 8097 ocupado; no se detuvo ningun servicio") from None
    version = hashlib.sha256(b"".join((SOURCE / name).read_bytes() for name in ("Dockerfile", "requirements.txt", "app.py"))).hexdigest()[:16]
    image = "suu-victus-relay:" + version
    print("Construyendo puente autenticado…", flush=True)
    subprocess.run(cmd + ["build", "-t", image, str(SOURCE)], check=True)
    name = f"suu-victus-probe-{os.getpid()}-{time.time_ns()}"
    try:
        subprocess.run(cmd + ["run", "-d", "--name", name, "--init", "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges:true", "--cpus", ".5", "--memory", "384m", "--pids-limit", "80",
            "--user", f"{os.getuid()}:{os.getgid()}", "--network", "portal_default", "-p", "127.0.0.1:8097:8080",
            "-v", f"{TARGET / 'secrets/suu_api_key.txt'}:/run/secrets/suu_api_key:ro", "-e", "SUU_VICTUS_URL=" + url, image], check=True)
        print("Precargando Victus y probando SSE desde contenedor candidato…", flush=True)
        state = wait_health(8097, cmd, name)
        if state.get("backend") != "victus":
            raise ValueError("Candidato inesperado")
        smoke(8097, token)
    except (Exception, KeyboardInterrupt):
        subprocess.run(cmd + ["logs", "--tail", "20", name], check=False)
        raise
    finally:
        subprocess.run(cmd + ["rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    activate(cmd, render(image, url), token)


if __name__ == "__main__":
    def interrupted(*_):
        raise KeyboardInterrupt
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, interrupted)
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print("No completado:", str(error) if isinstance(error, (ValueError, TimeoutError)) else type(error).__name__)
        raise SystemExit(1)
