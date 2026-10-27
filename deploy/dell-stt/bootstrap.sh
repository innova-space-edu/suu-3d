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
# Only migrate the exact v1 files already copied by the previously failed
# installer. Unknown/manual edits are NEVER overwritten.
files=(compose.yaml Dockerfile requirements.txt service.py preload.py)
previous_revisions=("9d9bcec1d9c0333840273683efbf7650fb94d6a0" "69fc4139a6f30cdc80c5726d0572d6b135f031b6")
migrate=()
[[ ! -L "$target" ]] || { echo "Destino simbólico no permitido"; exit 1; }
for f in "${files[@]}"; do
 [[ -f "$src/$f" && ! -L "$src/$f" ]] || { echo "Falta $f"; exit 1; }
 if [[ -e "$target/$f" || -L "$target/$f" ]]; then
  [[ -f "$target/$f" && ! -L "$target/$f" ]] || {
   echo "Archivo de destino no es regular: $target/$f"; exit 1;
  }
  if ! cmp -s "$src/$f" "$target/$f"; then
   known_old=false
   for rev in "${previous_revisions[@]}"; do
    if git -C "$src" show "$rev:deploy/dell-stt/$f" 2>/dev/null | cmp -s - "$target/$f"; then
     known_old=true
     break
    fi
   done
   if [[ "$known_old" == true ]]; then
    migrate+=("$f")
   else
    echo "Archivo modificado o desconocido: $target/$f. No se sobrescribirá"; exit 1;
   fi
  fi
 fi
done
if (( ${#migrate[@]} > 0 )); then
 echo "Migración segura: ${migrate[*]} (solo revisiones anteriores verificadas)"
fi
echo "Fuente: $src"
echo "Destino: $target"
echo "Contenedor: suu-stt, puerto localhost 127.0.0.1:8095, CPU 2, RAM 2GiB"
echo "No toca: suu-llm, intranet, MCP, PostgreSQL, DNS o Cloudflare"
if [[ "$mode" == --dry-run ]]; then echo "PREVISUALIZACIÓN. Sin modificaciones"; exit 0; fi
install -d -m 0700 "$target" "$target/models" "$target/secrets"
if (( ${#migrate[@]} > 0 )); then
 timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
 for f in "${migrate[@]}"; do
  [[ ! -e "$target/$f.bak.$timestamp" ]] || {
   echo "El respaldo ya existe; abortado"; exit 1;
  }
 done
 for f in "${migrate[@]}"; do
  cp -p "$target/$f" "$target/$f.bak.$timestamp"
  echo "Respaldo: $target/$f.bak.$timestamp"
 done
fi
for f in "${files[@]}"; do cp "$src/$f" "$target/$f"; done
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
