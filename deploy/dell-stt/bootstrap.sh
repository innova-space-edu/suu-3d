#!/usr/bin/env bash
# Owner SSH only: install isolated CPU STT alongside Qwen, without touching intranet.
set -Eeuo pipefail
mode="${1:---dry-run}"
[[ $# -le 1 && ( "$mode" == --dry-run || "$mode" == --apply ) ]] || { echo "Uso: bash bootstrap.sh --dry-run|--apply"; exit 2; }
[[ "$EUID" != 0 ]] || { echo "Usar la sesión normal del propietario, no root"; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="$HOME/suu-stt"
if docker info >/dev/null 2>&1; then docker_cmd=(docker); else
  command -v sudo >/dev/null || { echo "sudo no está instalado"; exit 1; }
  sudo -v; docker_cmd=(sudo docker)
fi
"${docker_cmd[@]}" info >/dev/null
"${docker_cmd[@]}" compose version >/dev/null
"${docker_cmd[@]}" network inspect portal_default >/dev/null || { echo "Falta portal_default"; exit 1; }
for f in compose.yaml Dockerfile requirements.txt service.py preload.py; do
 [[ -f "$src/$f" && ! -L "$src/$f" ]] || { echo "Falta $f"; exit 1; }
 if [[ -e "$target/$f" ]] && ! cmp -s "$src/$f" "$target/$f"; then
  echo "Hay una versión local modificada de $target/$f. Revisión manual requerida"; exit 1
 fi
done
echo "Fuente: $src"
echo "Destino: $target"
echo "Contenedor: suu-stt, puerto localhost 127.0.0.1:8095, CPU 2, RAM 2GiB"
echo "No toca: suu-llm, intranet, MCP, PostgreSQL, DNS o Cloudflare"
if [[ "$mode" == --dry-run ]]; then echo "PREVISUALIZACIÓN. Sin modificaciones"; exit 0; fi
install -d -m 0700 "$target" "$target/models" "$target/secrets"
for f in compose.yaml Dockerfile requirements.txt service.py preload.py; do cp "$src/$f" "$target/$f"; done
envfile="$target/.env"
if [[ -e "$envfile" ]]; then
 [[ -f "$envfile" && ! -L "$envfile" ]] || { echo ".env inválido"; exit 1; }
 grep -Fxq "STT_UID=$(id -u)" "$envfile" && grep -Fxq "STT_GID=$(id -g)" "$envfile" || { echo "UID/GID diferente del propietario"; exit 1; }
else
 printf 'STT_UID=%s\nSTT_GID=%s\n' "$(id -u)" "$(id -g)" >"$envfile"
fi
chmod 0600 "$envfile"
secret="$target/secrets/stt_api_key.txt"
if [[ ! -e "$secret" ]]; then umask 077; openssl rand -hex 32 >"$secret"; fi
[[ -f "$secret" && ! -L "$secret" ]] || { echo "Secreto no es un archivo privado"; exit 1; }
chmod 0600 "$secret"
[[ "$(stat -c %u "$secret")" == "$(id -u)" ]] || { echo "Propiedad del secreto incorrecta"; exit 1; }
cd "$target"
"${docker_cmd[@]}" compose config --quiet
"${docker_cmd[@]}" compose build suu-stt
echo "Descargando modelo base multilingüe una sola vez (~145 MB)..."
"${docker_cmd[@]}" compose run --rm --no-deps -e HF_HUB_OFFLINE=0 suu-stt python preload.py
"${docker_cmd[@]}" compose up -d --no-deps suu-stt
echo "Servicio STT solicitado. Verificar:"
echo "sudo docker ps --filter name=suu-stt"
echo "curl -fsS http://127.0.0.1:8095/health"
echo "El token queda privado en $secret; no copiar al chat."
