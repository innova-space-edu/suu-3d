"""Owner-run Windows trial: Ollama CUDA text + persistent CPU Piper voices.
No public server, credentials, Dell changes, or production activation.
"""
import hashlib
import importlib.util
import io
import ipaddress
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request
import urllib.parse
import wave

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MODEL = "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
REV = "ae44f08e1392f39c0e474af10c3ff8355c8b6688"
VOICE_REV = "5041a7a49ae5b3a0f30e6837769eb03fdbb231bd"
FILES = [(MODEL, f"https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/{REV}/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf", 2497280736, "2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e")]
for locale, name, size, sha, config_size, config_sha in [
    ("es_ES", "sharvard-medium", 76733615, "40febfb1679c69a4505ff311dc136e121e3419a13a290ef264fdf43ddedd0fb1", 4903, "7438c9b699c72b0c3388dae1b68d3f364dc66a2150fe554a1c11f03372957b2c"),
    ("es_AR", "daniela-high", 114199011, "7ceb1fc0dab349418c5b54a639ae9ee595212d7c9ea422220d8419163d5cc985", 7248, "aedbf69647e1d754c62ecf8e0366ca5f16af3e768e3c6b5329af6eb6bde3852b")]:
    speaker, quality = name.split("-")
    filename = f"{locale}-{name}.onnx"
    url = f"https://huggingface.co/rhasspy/piper-voices/resolve/{VOICE_REV}/es/{locale}/{speaker}/{quality}/{filename}"
    FILES += [(filename, url, size, sha), (filename + ".json", url + ".json", config_size, config_sha)]


def load_module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest(path):
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def download(filename, url, size, sha):
    path = DATA / filename
    if path.exists():
        if path.is_symlink() or path.stat().st_size != size or digest(path) != sha:
            raise ValueError("Archivo existente no coincide: " + filename)
        return
    partial = path.with_suffix(path.suffix + f".{os.getpid()}.partial")
    print("Descargando:", filename, flush=True)
    try:
        with urllib.request.urlopen(url, timeout=90) as source, partial.open("xb") as target:
            count = 0
            while chunk := source.read(4 * 1024 * 1024):
                count += len(chunk)
                if count > size:
                    raise ValueError("Descarga excesiva")
                target.write(chunk)
        if count != size or digest(partial) != sha:
            raise ValueError("SHA o tamaño incorrecto: " + filename)
        partial.rename(path)
    finally:
        partial.unlink(missing_ok=True)


def ollama_base():
    raw = os.environ.get("OLLAMA_HOST", "127.0.0.1:11434").strip()
    parsed = urllib.parse.urlsplit(raw if "://" in raw else "http://" + raw)
    host = parsed.hostname
    if parsed.scheme != "http" or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("OLLAMA_HOST debe ser HTTP local o Tailscale sin ruta ni credenciales")
    if host != "localhost":
        ip = ipaddress.ip_address(host)
        if not ip.is_loopback and not (ip.version == 4 and ip in ipaddress.ip_network("100.64.0.0/10")):
            raise ValueError("El ensayo solo admite loopback o IP Tailscale")
    port = parsed.port or 11434
    return "http://" + (f"[{host}]" if ":" in host else host) + f":{port}"


def api(route, payload=None):
    request = urllib.request.Request(ollama_base() + route,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=120)


def completion(alias, system, prompt, on_delta=None):
    started, first, answer, final = time.perf_counter(), None, "", None
    with api("/api/chat", {"model": alias, "stream": True, "keep_alive": "5m",
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        "options": {"temperature": .4, "num_ctx": 2048, "num_predict": 96, "num_thread": 4}}) as response:
        for line in response:
            if not line.strip():
                continue
            event = json.loads(line)
            if event.get("error"):
                raise ValueError("Ollama devolvió error")
            text = event.get("message", {}).get("content", "")
            if text:
                first = first if first is not None else time.perf_counter() - started
                answer += text
                if len(answer) > 4500:
                    raise ValueError("Respuesta excesiva")
                if on_delta:
                    on_delta(text)
            if event.get("done"):
                final = event
                break
    if final is None or not answer.strip():
        raise ValueError("Respuesta incompleta")
    seconds = time.perf_counter() - started
    generation = final.get("eval_duration", 0) / 1e9
    return {"answer": answer, "first_text_seconds": round(first, 3), "total_seconds": round(seconds, 3),
        "finish_reason": final.get("done_reason"), "load_seconds": round(final.get("load_duration", 0) / 1e9, 3),
        "tokens_per_second": round(final.get("eval_count", 0) / generation, 2) if generation else None}


def make_voice(filename, speaker):
    import onnxruntime as ort
    from piper import PiperVoice
    from piper.config import PiperConfig, SynthesisConfig
    options = ort.SessionOptions()
    options.intra_op_num_threads, options.inter_op_num_threads = 2, 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    options.add_session_config_entry("session.intra_op.allow_spinning", "0")
    options.add_session_config_entry("session.inter_op.allow_spinning", "0")
    config = PiperConfig.from_dict(json.loads((DATA / (filename + ".json")).read_text(encoding="utf-8")))
    voice = PiperVoice(config=config, session=ort.InferenceSession(str(DATA / filename), sess_options=options,
                      providers=["CPUExecutionProvider"]))
    synthesis = SynthesisConfig(speaker_id=speaker)
    def synthesize(text):
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            voice.synthesize_wav(text, wav, syn_config=synthesis)
        audio = output.getvalue()
        with wave.open(io.BytesIO(audio), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        return audio, duration
    return synthesize


def cleanup_alias(alias):
    try:
        with api("/api/generate", {"model": alias, "keep_alive": 0}) as response:
            response.read()
    finally:
        subprocess.run(["ollama", "rm", alias], check=False)


def main():
    if os.name != "nt":
        raise ValueError("Este ensayo se ejecuta en el Victus Windows")
    DATA.mkdir(exist_ok=True)
    if shutil.disk_usage(DATA).free < 7 * 1024 ** 3:
        raise ValueError("Se requieren 7 GiB libres en disco para descarga, importación y margen")
    os.environ["OLLAMA_HOST"] = ollama_base()  # CLI imports, inference and cleanup must use the same server.
    print(json.dumps({"ollama_base": os.environ["OLLAMA_HOST"]}), flush=True)
    with api("/api/version") as response:
        version = json.load(response)
    with api("/api/ps") as response:
        if json.load(response).get("models"):
            raise ValueError("Hay modelos Ollama cargados. Finaliza su uso y descargalos de memoria antes del ensayo")
    print(json.dumps({"ollama": version}), flush=True)
    for file in FILES:
        download(*file)
    quality = load_module("quality", "benchmark-quality.py")
    speech = load_module("speech", "speech-probe.py")
    alias = "suu-victus-trial-" + str(time.time_ns())
    modelfile = DATA / "Modelfile"
    modelfile.write_text('FROM "' + (DATA / MODEL).as_posix() + '"\nPARAMETER num_ctx 2048\n', encoding="utf-8")
    report = {"model": MODEL, "model_sha": FILES[0][3], "alias": alias, "ollama": version,
              "note": "Ensayo local; no mide Vercel, Cloudflare ni reproducción web; voz Piper CPU, texto Ollama GPU/CPU según descarga real"}
    report_path = DATA / ("report-" + str(time.time_ns()) + ".json")
    try:
        subprocess.run(["ollama", "create", alias, "-f", str(modelfile)], check=True)
        hardware = ROOT / "hardware.json"
        if hardware.exists():
            report["hardware"] = json.loads(hardware.read_text(encoding="utf-8-sig"))
        report["warmup"] = completion(alias, quality.SYSTEM, "Di solamente: listo.")
        with api("/api/ps") as response:
            report["loaded_models"] = json.load(response)
        print(json.dumps({"loaded_models": report["loaded_models"]}), flush=True)
        rows = []
        for case, prompt, expected in quality.CASES:
            row = {"case": case, **completion(alias, quality.SYSTEM, prompt)}
            row["exact_match"] = None if expected is None else quality.normalized(row["answer"]) == expected
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
        report["quality"] = rows
        report["voices"] = {}
        for label, filename, speaker in [("sharvard", "es_ES-sharvard-medium.onnx", 1),
                                          ("daniela", "es_AR-daniela-high.onnx", 0)]:
            synthesize = make_voice(filename, speaker)
            sample, _ = synthesize("Hola, soy SUU. Los planetas orbitan alrededor del Sol por la gravedad.")
            sample_path = DATA / (label + "-sample.wav")
            sample_path.write_bytes(sample)
            probes = []
            for number in range(3):
                result = speech.measure(lambda delta: completion(alias, quality.SYSTEM,
                    "Explica en tres frases por qué los planetas orbitan alrededor del Sol.", on_delta=delta),
                    lambda text: synthesize(text)[1], 35, 80)
                probes.append(result)
                print(json.dumps({"voice": label, "sample": number + 1, **result}, ensure_ascii=False), flush=True)
            report["voices"][label] = {"samples": probes, "audition_file": str(sample_path),
                **{key: max(row[key] for row in probes) for key in ("first_audio_ready_seconds", "piper_rtf", "max_gap_estimated_seconds", "model_total_seconds")}}
            del synthesize
        print(json.dumps({"summary": {name: {key: value for key, value in row.items() if key != "samples"}
                                       for name, row in report["voices"].items()}}, ensure_ascii=False), flush=True)
    finally:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        cleanup_alias(alias)
        print("Informe:", report_path, flush=True)
        print("SUU y Dell no fueron modificados.", flush=True)


if __name__ == "__main__":
    main()
