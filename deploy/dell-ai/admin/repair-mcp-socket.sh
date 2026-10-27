#!/usr/bin/env bash
# Reattach the current host /run/innova-admin directory to ONLY intranet-mcp.
# Do not use "docker compose down" or restart any unrelated container.
set -Eeuo pipefail
mode="${1:---dry-run}"
[[ $# -le 1 && ( "$mode" == "--dry-run" || "$mode" == "--apply" ) ]] || {
  echo "Uso: bash repair-mcp-socket.sh --dry-run|--apply" >&2
  exit 2
}
[[ "$EUID" -ne 0 ]] || { echo "Ejecutar desde la sesión SSH del propietario, no como root" >&2; exit 1; }
if docker info >/dev/null 2>&1; then
  docker_cmd=(docker)
else
  command -v sudo >/dev/null || { echo "Falta sudo" >&2; exit 1; }
  sudo -v
  docker_cmd=(sudo docker)
fi
"${docker_cmd[@]}" info >/dev/null
[[ -S /run/innova-admin/admin.sock ]] || {
  echo "No existe el socket real del agente en el anfitrión. Detenido." >&2
  exit 1
}
container="intranet-mcp"
service=$("${docker_cmd[@]}" inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container")
project=$("${docker_cmd[@]}" inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container")
workdir=$("${docker_cmd[@]}" inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container")
filelist=$("${docker_cmd[@]}" inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$container")
mount_source=$("${docker_cmd[@]}" inspect -f '{{range .Mounts}}{{if eq .Destination "/run/innova-admin"}}{{.Source}}{{end}}{{end}}' "$container")
[[ "$service" == mcp && "$project" == portal && "$workdir" == /srv/intranet/portal ]] || {
  echo "Etiquetas Compose no coinciden con el despliegue conocido: abortado" >&2
  exit 1
}
[[ "$mount_source" == /run/innova-admin ]] || {
  echo "El origen del montaje administrativo es diferente: abortado" >&2
  exit 1
}
IFS=',' read -r -a files <<<"$filelist"
[[ "${#files[@]}" -ge 2 && "${#files[@]}" -le 16 ]] || {
  echo "Lista de Compose ausente o inesperada" >&2; exit 1;
}
args=()
for file in "${files[@]}"; do
  [[ "$file" == /srv/intranet/portal/*.yaml && "$file" != *".."* && -f "$file" && ! -L "$file" ]] || {
    echo "Ruta Compose no autorizada o no disponible: $file" >&2
    exit 1
  }
  args+=(-f "$file")
done
cd "$workdir"
"${docker_cmd[@]}" compose -p "$project" "${args[@]}" config --quiet
"${docker_cmd[@]}" compose -p "$project" "${args[@]}" config --services | grep -Fxq "$service" || {
  echo "Servicio mcp no existe en la configuración efectiva" >&2; exit 1;
}
if "${docker_cmd[@]}" exec "$container" sh -c 'test -S /run/innova-admin/admin.sock' >/dev/null 2>&1; then
  echo "SOCKET_OK: intranet-mcp ya ve el socket. No hace falta recrear."
  exit 0
fi

echo "Fallo verificado: socket presente en Debian pero ausente en intranet-mcp."
echo "Montaje esperado: /run/innova-admin -> /run/innova-admin"
echo "Proyecto: $project; servicio exclusivo a reparar: $service"
printf 'Archivo Compose utilizado: %s\n' "${files[@]}"
if [[ "$mode" == "--dry-run" ]]; then
  echo "Previsualización completa. NO se realizaron cambios."
  echo "Para recrear solo intranet-mcp: bash admin/repair-mcp-socket.sh --apply"
  exit 0
fi

echo "Recreando SOLO intranet-mcp desde su Compose existente..."
"${docker_cmd[@]}" compose -p "$project" "${args[@]}" up \
  -d --no-deps --no-build --pull never --force-recreate "$service"
if "${docker_cmd[@]}" exec "$container" sh -c 'test -S /run/innova-admin/admin.sock'; then
  echo "SOCKET_OK: montaje recuperado. Verificar admin_estado desde ChatGPT."
else
  echo "El nuevo contenedor todavía no ve el socket. Revisar Compose y estado del agente." >&2
  exit 1
fi
