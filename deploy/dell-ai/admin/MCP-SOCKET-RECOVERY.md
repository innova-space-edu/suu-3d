# Recuperación del socket administrativo MCP en el Dell

## Evidencia de campo

- En Debian existe `/run/innova-admin/admin.sock`, con permisos `root:estefano` y `0660`.
- `innova-admin-agent.service`, el túnel y el endpoint `/healthz` están activos.
- Dentro de `intranet-mcp`, `/run/innova-admin` está montado, pero falta `admin.sock`.
- El contenedor usa el proyecto Compose `portal`, servicio `mcp` y siete archivos Compose en `/srv/intranet/portal`.

Esto es compatible con un bind mount de una instancia antigua del directorio:
reiniciar el agente en Debian puede recrear su `RuntimeDirectory` sin actualizar
el directorio que ya tiene montado el contenedor existente.

## Reparación con comprobaciones previas

Desde la sesión SSH del propietario:

```bash
cd ~/suu-3d
git pull --ff-only
cd deploy/dell-ai
bash admin/repair-mcp-socket.sh --dry-run
```

Confirmar que el diagnóstico muestra exclusivamente el proyecto `portal`,
el servicio `mcp`, origen `/run/innova-admin` y los archivos Compose correctos.

Después, con aprobación expresa del propietario:

```bash
bash admin/repair-mcp-socket.sh --apply
sudo docker exec intranet-mcp sh -c 'test -S /run/innova-admin/admin.sock && echo SOCKET_OK'
curl -fsS http://127.0.0.1:3199/healthz
```

El script realiza `docker compose up -d --no-deps --no-build --pull never
--force-recreate mcp`, especificando los archivos originales del proyecto.
No ejecuta `down`, no inicia dependencias, no modifica la política ni
recrea el portal, PostgreSQL, el runner o los servicios de Kaggle.
El propio `intranet-mcp` sufrirá una interrupción breve durante el reemplazo.

**No** dar `chmod 777` al socket, no añadir Docker socket al MCP y no quitar
aprobaciones por ticket. Si el socket sigue sin aparecer, detenerse y analizar
los logs y los montajes del nuevo contenedor.

## SUU Qwen: HTTP 503 inmediatamente después del arranque

Un `503` cuando `suu-llm` lleva menos de un segundo en ejecución
es compatible con la carga del modelo. Esperar a que el estado sea `healthy`:

```bash
sudo docker inspect suu-llm --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'
sudo docker logs --tail 30 suu-llm
python3 admin/verify-suu.py
```

No volver a descargar el GGUF, cambiar la clave ni recrear el modelo por ese
503 inicial. Solo investigar más si continúa devolviendo 503 después de
alcanzar el estado saludable, o si la respuesta final sigue vacía.
