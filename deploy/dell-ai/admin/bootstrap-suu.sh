#!/usr/bin/env bash
# Aprovisionamiento INICIAL (propietario en SSH). No se ejecuta desde el runner MCP.
set -Eeuo pipefail
umask 077

usage() {
  echo "Uso: bash bootstrap-suu.sh --dry-run|--apply [directorio-destino]"
  exit 2
}
[[ $# -ge 1 && $# -le 2 ]] || usage
mode="$1"
[[ "$mode" == "--apply" || "$mode" == "--dry-run" ]] || usage
[[ "${EUID}" -ne 0 ]] || { echo "Usar usuario propietario, no root"; exit 1; }

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target="${2:-$HOME/suu-ai}"
[[ "$target" = /* ]] || { echo "El destino debe ser absoluto"; exit 1; }
[[ ! -L "$target" ]] || { echo "No se admiten destinos symlink"; exit 1; }
[[ "$target" != "/srv/intranet/portal" && "$target" != "/srv/intranet/mcp" ]] || { echo "Destino protegido"; exit 1; }

command -v docker >/dev/null
command -v curl >/dev/null
command -v openssl >/dev/null
docker info >/dev/null
docker compose version >/dev/null
docker network inspect portal_default >/dev/null
[[ -f "$source_dir/compose.yaml" ]] || { echo "Falta compose.yaml"; exit 1; }
[[ ! -e "$target/compose.yaml" || "$(sha256sum "$target/compose.yaml" | cut -d' ' -f1)" == "$(sha256sum "$source_dir/compose.yaml" | cut -d' ' -f1)" ]] || {
  echo "Ya existe un Compose diferente en destino; no se sobrescribirá"; exit 1;
}
echo "Origen: $source_dir"
echo "Destino: $target"
echo "Red externa: portal_default"
echo "Imagen definida en Compose: ghcr.io/ggml-org/llama.cpp:server"
echo "Servicio unico: suu-llm, puerto host 127.0.0.1:8094, CPU 2, RAM 3 GiB"
echo "No toca: PostgreSQL, MCP, intranet, cloudflared, Tailscale, backups"
if [[ "$mode" == "--dry-run" ]]; then
  echo "PREVISUALIZACIÓN; no se descargó ni modificó nada"
  exit 0
fi

install -d -m 0700 "$target" "$target/models" "$target/secrets"
cp "$source_dir/compose.yaml" "$target/compose.yaml"
chmod 0600 "$target/compose.yaml"
key="$target/secrets/suu_api_key.txt"
if [[ ! -s "$key" ]]; then
  [[ ! -e "$key" ]] || { echo "Clave existente vacía; abortado"; exit 1; }
  openssl rand -hex 32 >"$key"
fi
chmod 0600 "$key"
model="$target/models/Qwen3.5-0.8B-Q4_K_M.gguf"
if [[ ! -s "$model" ]]; then
  [[ ! -e "$model" ]] || { echo "Modelo vacío; abortado"; exit 1; }
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 600 \
    "https://huggingface.co/bartowski/Qwen_Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf" \
    --output "$model.partial"
  [[ "$(stat -c%s "$model.partial")" -gt 400000000 ]] || {
    rm -f -- "$model.partial"
    echo "Modelo descargado sospechosamente pequeño; abortado"; exit 1;
  }
  mv -- "$model.partial" "$model"
fi
chmod 0600 "$model"
echo "SHA256 del GGUF (verificar contra origen confiable):"
sha256sum "$model"
(
  cd "$target"
  docker compose -f compose.yaml config --quiet
  docker compose -f compose.yaml up -d --no-deps suu-llm
)
echo "Servicio solicitado. Validar con docker logs suu-llm y consulta /v1/chat/completions."
echo "No se modificó la política MCP ni se creó Cloudflare Access."
