#!/usr/bin/env bash
# Benchmark in isolated containers; choose only the one-core medium candidate.
set -Eeuo pipefail
[[ "${1:---dry-run}" == --apply ]] || {
 echo "Uso: bash compare-voices.sh --apply"
 echo "Compara Daniela/1 CPU, Sharvard femenina/1 CPU y Sharvard femenina/2 CPU."
 echo "Activa Sharvard/1 CPU solo si RTF<1 y mejora al menos 15%; conserva Daniela."
 exit 0;
}
[[ "$EUID" != 0 ]] || { echo "Ejecutar como propietario, no root"; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="$HOME/suu-tts"
[[ -d "$target" && ! -L "$target" && -d "$target/models" && ! -L "$target/models" ]] || exit 1
if docker info >/dev/null 2>&1; then cmd=(docker); else sudo -v; cmd=(sudo docker); fi
bash "$src/upgrade.sh" --apply
echo "Descargando Sharvard medium (incluye hablante femenina F:1)…"
"${cmd[@]}" run --rm --network bridge --read-only --cap-drop ALL \
 --security-opt no-new-privileges --cpus 1 --memory 1g --pids-limit 96 \
 --user "$(id -u):$(id -g)" -e HOME=/voices -e XDG_CACHE_HOME=/voices/.cache \
 -v "$target/models:/voices" --entrypoint python suu-tts-local:1 \
 -m piper.download_voices --data-dir /voices es_ES-sharvard-medium
report="$target/voice-comparison-$(date -u +%Y%m%dT%H%M%S)-$$.jsonl"
umask 077
touch "$report"
for profile in daniela:1 sharvard:1 sharvard:2; do
 voice="${profile%:*}"; threads="${profile#*:}"
 if [[ "$voice" == daniela ]]; then model=es_AR-daniela-high; speaker=0
 else model=es_ES-sharvard-medium; speaker=1; fi
 echo "Prueba: $voice · CPU/hilos $threads"
 "${cmd[@]}" run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --cpus "$threads" --memory 1g --pids-limit 96 \
  --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,nosuid,size=64m \
  -e HOME=/tmp -e XDG_CACHE_HOME=/tmp -e PIPER_THREADS="$threads" \
  -e PIPER_MODEL="/voices/$model.onnx" -e PIPER_SPEAKER_ID="$speaker" \
  -v "$target/models:/voices:ro" \
  -v "$target/secrets/tts_api_key.txt:/run/secrets/tts_api_key:ro" \
  --entrypoint python suu-tts-local:1 /app/benchmark.py --offline | tee -a "$report"
done
echo "Informe: $report"
choice="$(python3 "$src/profiles.py" recommend "$report")"
if [[ "$choice" == sharvard ]]; then
 bash "$src/select-voice.sh" sharvard 1
else
 echo "Se conserva el perfil actual: Sharvard/1 CPU no cumple ambos objetivos."
fi
echo "Dos CPU solo se midieron; no se activan automáticamente."
