# Ampliación controlada del MCP Dell V12.2 para SUU

**Verificación por SSH (26-10-2026):** `innova-admin-agent.service` está
activo, su ejecutable es `/opt/innova-admin/agent.py`, Docker funciona con
`sudo` y el único `policy.json` localizado en directorios habituales es
`/etc/innova-admin/policy.json`. El contenedor `suu-llm` arrancó y el GGUF
superó la comprobación de SHA-256. **Todavía no hay prueba de inferencia real.**
Las herramientas administrativas del conector siguen fallando después del
reinicio; no dar por confirmada su recuperación. No se debe
convertir `ejecutar_comando_aislado` en shell del anfitrión ni montar
`/var/run/docker.sock` dentro del runner.

## Alcance exacto

- `bootstrap-suu.sh`: instala **únicamente** SUU LLM, en ruta propia del
  propietario. Requiere sesión SSH inicial con cuenta autorizada y acceso
  existente al CLI Docker; **no** se ejecuta desde ChatGPT. Crea clave y modelo
  locales; no escribe secretos en GitHub ni modifica otros contenedores.
- `register-suu-docker.py`: añade exclusivamente `suu-llm` al conjunto de
  nombres Docker autorizados de la ruta **confirmada** del `policy.json` activo.
  No presupone `/opt/innova-admin`. Valida esquema
  antes de tocar nada, guarda respaldo y preserva reglas previas.
- **Esto habilita administración Docker de SUU desde ChatGPT**, después de que
  el agente cargue la política. **No** habilita por sí solo instalaciones futuras
  vía `admin_preparar_operacion(op=instalar_servicio)`; ese permiso requiere una
  entrada válida en el catálogo existente y la actualización del agente o
  política con conocimiento de su esquema real.

## Recuperación y diagnóstico si aparece `docker.sock permission denied`

No añadir el usuario al grupo `docker`: concede privilegios equivalentes a root.
El bootstrap ahora detecta el error, solicita `sudo` y utiliza
`sudo docker` solo para acceder al daemon.

```bash
# Dentro de la sesión SSH del propietario
cd ~/suu-3d
git pull --ff-only
cd deploy/dell-ai

# Lectura de estado tras un reinicio: no cambia nada
sudo systemctl is-active innova-admin-agent.service
sudo systemctl status innova-admin-agent.service --no-pager -l
sudo journalctl -u innova-admin-agent.service --no-pager -n 40
sudo docker info >/dev/null && echo "Docker accesible con sudo"
sudo docker ps --filter name=intranet-mcp --format '{{.Names}}: {{.Status}}'

# Localizar CANDIDATOS al policy.json real (solo devuelve rutas)
sudo find /etc /opt /srv/intranet /usr/local -type f -name policy.json -print 2>/dev/null
```

**No publicar en tickets ni ChatGPT tokens o valores secretos encontrados
dentro de la política, unidad systemd o journal.** Una ruta encontrada por
`find` no demuestra que el agente la use. Inspeccionar **localmente**
`sudo systemctl cat innova-admin-agent.service` y el `agent.py` referenciado
para confirmar desde dónde carga `policy.json`.

## Reparación del reinicio continuo (error de acceso a clave)

El GGUF ya fue descargado; solo se necesita migrar el archivo Compose.
Se mantiene la misma clave y el mismo modelo. El instalador configura el
UID/GID de su propietario y monta la clave en modo solo lectura.

```bash
cd ~/suu-3d && git pull --ff-only
cd deploy/dell-ai
bash admin/bootstrap-suu.sh --dry-run
bash admin/bootstrap-suu.sh --apply
python3 admin/verify-suu.py
```

La migración se niega a sobrescribir un Compose personalizado; reconoce
únicamente la versión anterior conocida. No dar permisos públicos a la clave.

El registrador de política admite tanto listas como objetos en `catalog`,
pero nunca modifica ese campo. Previsualizar antes de aplicar cambios.

## Estado posterior al primer despliegue

Con `suu-llm` ya arrancado, **no es necesario reinstalarlo**. Primero validar
que realmente genera respuestas sin sacar la clave del servidor:

```bash
cd ~/suu-3d && git pull --ff-only
cd deploy/dell-ai
sudo docker ps --filter name=suu-llm
sudo docker logs --tail 60 suu-llm
python3 admin/verify-suu.py
```

El script usa solamente `127.0.0.1:8094` y lee la clave desde
`~/suu-ai/secrets/suu_api_key.txt`, sin mostrarla ni enviarla a otro host.
Un contenedor iniciado no equivale necesariamente a un modelo cargado.

Para registrar el contenedor (si la inferencia funciona y el MCP se recupera),
se encontró un candidato real en `/etc/innova-admin/policy.json`.
Antes de aplicarlo, confirmar localmente que el `agent.py` cargue esa misma
ruta, mediante `sudo grep -nE 'policy.json|POLICY' /opt/innova-admin/agent.py`
revisado solo en terminal del propietario. No compartir configuración sensible.
Luego, ejecutar:

```bash
sudo python3 admin/register-suu-docker.py --policy /etc/innova-admin/policy.json
# Si el esquema se reconoce y el único cambio es autorizar suu-llm:
sudo python3 admin/register-suu-docker.py --policy /etc/innova-admin/policy.json --apply
sudo python3 -m json.tool /etc/innova-admin/policy.json >/dev/null
sudo systemctl restart innova-admin-agent.service
sudo systemctl is-active innova-admin-agent.service
```

No utilizar la ruta antigua `/opt/innova-admin/policy.json` (no existe
en este equipo). No ejecutar `--apply` si `projects`/`docker` no concuerdan
con el esquema esperado, o si hay errores de autenticación persistentes en
el conector. La lista Docker por sí sola **no autoriza instalaciones nuevas**.

### Si el MCP administrativo continúa inaccesible

El agente puede estar `active` mientras su socket o el túnel MCP no respondan.
Recoger únicamente diagnóstico sin secretos:

```bash
sudo ls -l /run/innova-admin/admin.sock
sudo systemctl status innova-mcp-tunnel.service --no-pager -l
sudo docker ps --filter name=intranet-mcp --format '{{.Names}}: {{.Status}}'
curl -sS -o /dev/null -w "MCP health HTTP=%{http_code}\\n" http://127.0.0.1:3199/healthz
sudo tailscale serve status
```

Comprobar políticas de origen/identidad desde el portal privado, sin relajar
los controles para resolver un error de conexión. **No exponer el socket MCP,
no abrir el puerto en Internet y no desactivar la aprobación del propietario.**

## Paso inicial único desde SSH privado del propietario

```bash
cd ~/suu-3d/deploy/dell-ai
bash admin/bootstrap-suu.sh --dry-run
# Cuando el preflight pase:
bash admin/bootstrap-suu.sh --apply

# SOLO después de identificar la ruta real que usa el agente.
# Sustituir por el archivo confirmado, no por un candidato al azar:
POLICY=/etc/innova-admin/policy.json
sudo test -f "$POLICY" || { echo "Ruta no válida"; exit 1; }
sudo python3 admin/register-suu-docker.py --policy "$POLICY"
# Si la revisión conservadora es correcta, aplicar:
sudo python3 admin/register-suu-docker.py --policy "$POLICY" --apply
sudo python3 -m json.tool "$POLICY" >/dev/null
sudo systemctl restart innova-admin-agent.service
sudo systemctl is-active innova-admin-agent.service
```

Si el esquema de la política es distinto, el programa aborta sin modificarla.
No crear ni copiar una política nueva para hacer que el programa avance.
Si el servicio administrativo está fallando, diagnosticarlo antes de modificar
el archivo. La extensión de `catalog` requiere inspección específica de V12.2.

## Desde ChatGPT tras el paso inicial

1. `admin_estado`: comprobar que `docker` contiene `suu-llm`.
2. `admin_consultar(op=docker_lista)`: verificar contenedor.
3. `admin_preparar_operacion(op=docker_operacion, nombre=suu-llm, accion=restart)`.
4. El propietario revisa y aprueba **esa misma acción** en el portal privado
   de Tailscale Serve (HTTPS 8443); sin aprobar, nada se ejecuta.
5. `admin_confirmar_operacion` con el ticket exacto y consultar
   `admin_consultar(op=trabajo_estado)`. Tickets de uso único con caducidad.
6. Para nuevas imágenes/instalaciones, continuar usando SSH hasta poblar un
   catálogo concreto validado por el agente. **No** conceder Docker/root al runner.

## Observabilidad y reversión

```bash
sudo docker ps --filter name='suu-llm'
sudo docker logs --tail 80 suu-llm
sudo journalctl -u innova-admin-agent.service -n 80 --no-pager
sudo tailscale serve status
# Deshacer solo SUU sin tocar los otros servicios:
cd ~/suu-ai && sudo docker compose -f compose.yaml down
# Si se necesita revertir la política:
sudo ls -lt "${POLICY}".bak.*
# seleccionar explícitamente el respaldo correcto para restaurar, y reiniciar el agente
```

El modelo y la clave permanecen en `~/suu-ai` al detener el servicio.
La API HTTP de SUU escucha solo en `127.0.0.1:8094` del anfitrión,
pero el contenedor se encuentra en la red interna `portal_default`.
La ruta pública futura hacia SUU debe estar detrás de Cloudflare Access,
con service token de servidor a servidor y token Bearer del modelo.
**Nunca reutilizar el hostname del MCP, publicar Docker TCP ni Tailscale Funnel.**

## Extensión posterior deseada: catálogo de instalaciones

La forma segura de habilitar instalaciones enteramente desde ChatGPT es un
**catálogo de recetas inmutables**, no una shell root:

- Registrar un identificador de receta (`suu-llm`), ruta fija y fichero Compose
  inspeccionado con digest SHA-256; identidad del contenedor y red permitida.
- Exigir `admin_preparar_operacion` con nombre/servicio aprobados, política
  actual y checksum; dar una descripción concreta del plan y cambios.
- Aprobación por acción, uso único y expiración en portal privado del propietario.
- `admin_confirmar_operacion` ejecuta **solo esa receta**, con límites de
  recursos, logs, estado de trabajo y registro auditable.
- Rechazar Compose con `privileged`, `pid:host`, Docker socket, rutas sensibles
  del host, capacidades elevadas, modos host y elevación de permisos.
- Añadir rollback transaccional de la propia receta y tests de rechazo. No
  aceptar rutas de archivos aportadas por respuestas de IA sin cotejo del digest.

**Bloqueo pendiente:** no hay acceso de lectura al `agent.py` y
`policy.json` reales desde el conector de ChatGPT: `/workspace`
está aislado del anfitrión. Para aplicar la extensión del catálogo hace
falta inspeccionar esos dos archivos desde SSH (sin compartir secretos).
