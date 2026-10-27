#!/usr/bin/env bash
# Run as the logged-in Dell owner. Deliberately does not change Qwen/STT/intranet.
set -Eeuo pipefail
mode="${1:---dry-run}"
[[ $# -le 1 && ( "$mode" == --dry-run || "$mode" == --apply ) ]] || {
 echo "Uso: bash bootstrap.sh --dry-run|--apply"; exit 2;
}
[[ "$EUID" != 0 ]] || { echo "Ejecutar como propietario, no root"; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="$HOME/suu-tts"
files=(compose.yaml Dockerfile requirements.txt service.py)
if docker info >/dev/null 2>&1; then cmd=(docker); else
 command -v sudo >/dev/null || { echo "sudo no disponible"; exit 1; }
 sudo -v; cmd=(sudo docker)
fi
"${cmd[@]}" info >/dev/null
"${cmd[@]}" compose version >/dev/null
"${cmd[@]}" network inspect portal_default >/dev/null || {
 echo "Docker network portal_default no existe"; exit 1;
}
[[ ! -L "$target" ]] || { echo "Destino simbólico no permitido"; exit 1; }
for f in "${files[@]}"; do
 [[ -f "$src/$f" && ! -L "$src/$f" ]] || { echo "Falta $src/$f"; exit 1; }
 if [[ -e "$target/$f" || -L "$target/$f" ]]; then
  [[ -f "$target/$f" && ! -L "$target/$f" ]] || {
   echo "Archivo destino no regular: $target/$f"; exit 1;
  }
  cmp -s "$src/$f" "$target/$f" || {
   echo "Archivo existente diferente: $target/$f. No se sobrescribe"; exit 1;
  }
 fi
done
echo "Instalación aislada Piper · $target · 127.0.0.1:8096"
echo "CPU máximo 1 · RAM máximo 1 GiB · voz Daniela es-AR high (114 MB)"
echo "No toca: suu-stt, suu-llm, intranet, MCP, PostgreSQL, Cloudflare."
if [[ "$mode" == --dry-run ]]; then echo "PREVISUALIZACIÓN: sin cambios"; exit 0; fi
install -d -m 0700 "$target" "$target/models" "$target/secrets"
for f in "${files[@]}"; do cp "$src/$f" "$target/$f"; done
envfile="$target/.env"
if [[ -e "$envfile" ]]; then
 [[ -f "$envfile" && ! -L "$envfile" ]] || { echo ".env no regular"; exit 1; }
 grep -Fxq "TTS_UID=$(id -u)" "$envfile" &&
 grep -Fxq "TTS_GID=$(id -g)" "$envfile" || {
  echo "UID/GID distinto, abortado"; exit 1;
 }
else
 printf 'TTS_UID=%s\nTTS_GID=%s\n' "$(id -u)" "$(id -g)" > "$envfile"
fi
chmod 0600 "$envfile"
secret="$target/secrets/tts_api_key.txt"
if [[ ! -e "$secret" ]]; then (umask 077; openssl rand -hex 32 > "$secret"); fi
[[ -f "$secret" && ! -L "$secret" ]] || { echo "Clave inválida"; exit 1; }
[[ "$(stat -c %u "$secret")" == "$(id -u)" ]] || { echo "Clave no pertenece al propietario"; exit 1; }
chmod 0600 "$secret"
cd "$target"
"${cmd[@]}" compose config --quiet
"${cmd[@]}" compose build suu-tts
if [[ ! -s "$target/models/es_AR-daniela-high.onnx" ||
      ! -s "$target/models/es_AR-daniela-high.onnx.json" ]]; then
 echo "Descargando una vez la voz femenina es_AR-daniela-high (~114 MB)…"
 "${cmd[@]}" run --rm --network bridge --read-only --user "$(id -u):$(id -g)" \
   -e HOME=/voices -e XDG_CACHE_HOME=/voices/.cache \
   -v "$target/models:/voices" --entrypoint python suu-tts-local:1 \
   -m piper.download_voices --data-dir /voices es_AR-daniela-high
fi
[[ -s "$target/models/es_AR-daniela-high.onnx" &&
   -s "$target/models/es_AR-daniela-high.onnx.json" ]] || {
 echo "Modelo o JSON incompleto"; exit 1;
}
"${cmd[@]}" compose up -d --no-deps suu-tts
echo "Comprueba:"
echo "sudo docker ps --filter name=suu-tts"
echo "curl -fsS http://127.0.0.1:8096/health"
echo "Clave privada en $secret (no mostrar en el chat)"
