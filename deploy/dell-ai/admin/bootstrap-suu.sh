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
# Docker socket access is privileged. Prefer owner SSH + sudo; do NOT add
# the user to group docker (that would grant root-equivalent access).
if docker info >/dev/null 2>&1; then
  docker_cmd=(docker)
else
  command -v sudo >/dev/null || { echo "Docker requiere sudo y no está instalado"; exit 1; }
  echo "Docker necesita sudo. Se pedirá la contraseña del propietario."
  sudo -v
  sudo docker info >/dev/null || { echo "No se puede consultar Docker ni con sudo"; exit 1; }
  docker_cmd=(sudo docker)
fi
"${docker_cmd[@]}" compose version >/dev/null
"${docker_cmd[@]}" network inspect portal_default >/dev/null
[[ -f "$source_dir/compose.yaml" ]] || { echo "Falta compose.yaml"; exit 1; }
# Admit only a known previous version of this Compose. Never overwrite
# unrelated deployments or customized Compose files automatically.
needs_migration=false
if [[ -e "$target/compose.yaml" ]]; then
  [[ -f "$target/compose.yaml" && ! -L "$target/compose.yaml" ]] || {
    echo "Compose de destino no es un archivo normal"; exit 1;
  }
  if ! cmp -s "$target/compose.yaml" "$source_dir/compose.yaml"; then
    # Only exact published revisions of SUU's own Compose may be migrated.
    # Keep this list fixed; reject unknown/locally-customized Compose files.
    known_previous=(
      "c7a2b3f0f558b4c50aa658ae524f4156fca08a51"
      "121a1ef039953123b19c42585325ba54d2342c3b"
      "c0c051513cb364734f28cb04e67d0e10fdd88ff0"
    )
    matched=false
    for old_commit in "${known_previous[@]}"; do
      if git -C "$source_dir" show "$old_commit:deploy/dell-ai/compose.yaml" 2>/dev/null | cmp -s "$target/compose.yaml" -; then
        matched=true
        break
      fi
    done
    if [[ "$matched" == true ]]; then
      needs_migration=true
      echo "Migración segura detectada: Compose SUU publicado previamente"
    else
      echo "Compose existente desconocido o modificado: NO se sobrescribe"; exit 1;
    fi
  fi
fi
echo "Origen: $source_dir"
echo "Destino: $target"
echo "Red externa: portal_default"
echo "Imagen definida en Compose: ghcr.io/ggml-org/llama.cpp:server"
echo "Servicio unico: suu-llm, puerto host 127.0.0.1:8094, CPU 2, RAM 3 GiB"
echo "No toca: PostgreSQL, MCP, intranet, cloudflared, Tailscale, backups"
echo "UID/GID del servicio: $(id -u):$(id -g) (dueño de modelos y secreto)"
echo "Conserva el GGUF y la clave ya instalados"
if [[ "$mode" == "--dry-run" ]]; then
  echo "PREVISUALIZACIÓN; no se descargó ni modificó nada"
  exit 0
fi

install -d -m 0700 "$target" "$target/models" "$target/secrets"
# On first boot and after migration, Compose receives only numeric UID/GID,
# never any API key. The file is excluded from the Git repo at destination.
envfile="$target/.env"
if [[ -e "$envfile" ]]; then
  [[ -f "$envfile" && ! -L "$envfile" ]] || { echo ".env no válido"; exit 1; }
  grep -Fxq "SUU_RUN_UID=$(id -u)" "$envfile" &&
  grep -Fxq "SUU_RUN_GID=$(id -g)" "$envfile" || {
    echo "UID/GID actuales no coinciden con .env; revisión manual requerida"; exit 1;
  }
else
  printf 'SUU_RUN_UID=%s\nSUU_RUN_GID=%s\n' "$(id -u)" "$(id -g)" >"$envfile"
fi
chmod 0600 "$envfile"
if [[ "$needs_migration" == true ]]; then
  suffix="$(date -u +%Y%m%dT%H%M%SZ)"
  [[ ! -e "$target/compose.yaml.bak.$suffix" ]] || { echo "Respaldo ya existe"; exit 1; }
  cp -p "$target/compose.yaml" "$target/compose.yaml.bak.$suffix"
  echo "Compose anterior respaldado en $target/compose.yaml.bak.$suffix"
fi
cp "$source_dir/compose.yaml" "$target/compose.yaml"
chmod 0600 "$target/compose.yaml"
key="$target/secrets/suu_api_key.txt"
if [[ ! -s "$key" ]]; then
  [[ ! -e "$key" ]] || { echo "Clave existente vacía; abortado"; exit 1; }
  openssl rand -hex 32 >"$key"
fi
chmod 0600 "$key"
[[ "$(stat -c %u "$key")" == "$(id -u)" ]] || { echo "La clave no pertenece al usuario actual"; exit 1; }
model="$target/models/Qwen3.5-0.8B-Q4_K_M.gguf"
if [[ ! -s "$model" ]]; then
  [[ ! -e "$model" ]] || { echo "Modelo vacío; abortado"; exit 1; }
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 600 \
    "https://huggingface.co/bartowski/Qwen_Qwen3.5-0.8B-GGUF/resolve/167243f271bba42ffec2e50e982cb3614d6a0b05/Qwen_Qwen3.5-0.8B-Q4_K_M.gguf" \
    --output "$model.partial"
  [[ "$(stat -c%s "$model.partial")" -gt 400000000 ]] || {
    rm -f -- "$model.partial"
    echo "Modelo descargado sospechosamente pequeño; abortado"; exit 1;
  }
  mv -- "$model.partial" "$model"
fi
chmod 0600 "$model"
[[ "$(stat -c %u "$model")" == "$(id -u)" ]] || { echo "El GGUF no pertenece al usuario actual"; exit 1; }
# SHA256 publicado en la ficha del archivo GGUF Q4_K_M.
expected_sha="fb044e93939a70469c905781334f5de1e6c8b608ced6cbc8c9249bd4127d9526"
actual_sha="$(sha256sum "$model" | awk '{print $1}')"
[[ "$actual_sha" == "$expected_sha" ]] || { echo "SHA256 del GGUF incorrecto: abortado"; exit 1; }
echo "SHA256 del GGUF verificado: $actual_sha"
(
  cd "$target"
  "${docker_cmd[@]}" compose -f compose.yaml config --quiet
  "${docker_cmd[@]}" compose -f compose.yaml up -d --no-deps suu-llm
)
echo "Servicio solicitado. Validar con sudo docker logs suu-llm y consulta /v1/chat/completions."
echo "No se modificó la política MCP ni se creó Cloudflare Access."
