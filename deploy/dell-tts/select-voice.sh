#!/usr/bin/env bash
set -Eeuo pipefail
profile="${1:-}"; threads="${2:-1}"
[[ $# -le 2 && ( "$profile" == daniela || "$profile" == sharvard ) &&
   ( "$threads" == 1 || "$threads" == 2 ) ]] || {
 echo "Uso: bash select-voice.sh daniela|sharvard 1|2"; exit 2;
}
[[ "$EUID" != 0 ]] || exit 1
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="$HOME/suu-tts"
[[ -d "$target" && ! -L "$target" && -f "$target/.env" && ! -L "$target/.env" ]] || exit 1
model=es_AR-daniela-high
[[ "$profile" != sharvard ]] || model=es_ES-sharvard-medium
[[ -s "$target/models/$model.onnx" && -s "$target/models/$model.onnx.json" ]] || {
 echo "Falta el modelo; ejecutar compare-voices.sh --apply primero"; exit 1;
}
if docker info >/dev/null 2>&1; then cmd=(docker); else sudo -v; cmd=(sudo docker); fi
backup="$target/.env.before-voice-$(date -u +%Y%m%dT%H%M%S)-$$"
cp -p "$target/.env" "$backup"
python3 "$src/profiles.py" set "$target/.env" "$profile" "$threads"
cd "$target"
if ! "${cmd[@]}" compose up -d --no-deps --wait --wait-timeout 180 suu-tts; then
 cp -p "$backup" "$target/.env"
 "${cmd[@]}" compose up -d --no-deps --wait --wait-timeout 180 suu-tts
 echo "El perfil falló; se restauró la configuración anterior."; exit 1
fi
echo "Perfil activo: $profile · CPU/hilos $threads"
curl -fsS --max-time 5 http://127.0.0.1:8096/health
echo
