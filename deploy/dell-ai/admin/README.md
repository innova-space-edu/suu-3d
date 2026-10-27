# Ampliación controlada del MCP Dell V12.2 para SUU

**Auditoría inicial (26-10-2026):** el agente `innova-admin-agent` respondía,
Tailscale Serve exigía identidad propietaria y el catálogo `catalog=[]` estaba vacío.
Después del reinicio manual, el conector comenzó a fallar; comprobar el servicio real por SSH. No se debe
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

## Paso inicial único desde SSH privado del propietario

```bash
cd ~/suu-3d/deploy/dell-ai
bash admin/bootstrap-suu.sh --dry-run
# Cuando el preflight pase:
bash admin/bootstrap-suu.sh --apply

# SOLO después de identificar la ruta real que usa el agente.
# Sustituir por el archivo confirmado, no por un candidato al azar:
POLICY=/ruta/real/confirmada/policy.json
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
