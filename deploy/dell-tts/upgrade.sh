#!/usr/bin/env bash
# Update the existing installation, preserving voice files, token and .env.
set -Eeuo pipefail
mode="${1:---dry-run}"
[[ $# -le 1 && ( "$mode" == --dry-run || "$mode" == --apply ) ]] || exit 2
[[ "$EUID" != 0 ]] || { echo "Ejecutar como propietario, no root"; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="$HOME/suu-tts"
[[ -d "$target" && ! -L "$target" && -f "$target/.env" && ! -L "$target/.env" ]] || {
 echo "Falta instalación existente en ~/suu-tts"; exit 1;
}
files=(compose.yaml Dockerfile requirements.txt service.py benchmark.py)
for file in "${files[@]}"; do
 [[ -f "$src/$file" && ! -L "$src/$file" && ! -L "$target/$file" ]] || exit 1
done
echo "Actualización: ONNX sin espera activa, precalentamiento y métricas."
echo "Conserva el perfil de voz/CPU de .env (por defecto Daniela, 1 CPU), claves y modelos."
if [[ "$mode" == --dry-run ]]; then echo "Sin cambios. Usar --apply para instalar."; exit 0; fi
if docker info >/dev/null 2>&1; then cmd=(docker); else sudo -v; cmd=(sudo docker); fi
backup="$target/backups/$(date -u +%Y%m%dT%H%M%S)-$$"
install -d -m 0700 "$backup"
for file in "${files[@]}"; do
 if [[ -f "$target/$file" ]]; then cp -p "$target/$file" "$backup/$file"; fi
 cp "$src/$file" "$target/$file"
done
cd "$target"
"${cmd[@]}" compose config --quiet
"${cmd[@]}" compose build suu-tts
"${cmd[@]}" compose up -d --no-deps --wait --wait-timeout 180 suu-tts
echo "Respaldo de configuración: $backup"
echo "Esperar health=healthy y medir: sudo docker exec suu-tts python /app/benchmark.py"
