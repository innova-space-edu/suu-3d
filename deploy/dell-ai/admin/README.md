# Ampliación controlada del MCP Dell V12.2 para SUU

**Estado real (26-10-2026):** el agente `innova-admin-agent` funciona, Tailscale Serve
exige identidad propietaria y el catálogo `catalog=[]` está vacío. No se debe
convertir `ejecutar_comando_aislado` en shell del anfitrión ni montar
`/var/run/docker.sock` dentro del runner.

## Alcance exacto

- `bootstrap-suu.sh`: instala **únicamente** SUU LLM, en ruta propia del
  propietario. Requiere sesión SSH inicial con cuenta autorizada y acceso
  existente al CLI Docker; **no** se ejecuta desde ChatGPT. Crea clave y modelo
  locales; no escribe secretos en GitHub ni modifica otros contenedores.
- `register-suu-docker.py`: añade exclusivamente `suu-llm` al conjunto de
  nombres Docker autorizados de `/opt/innova-admin/policy.json`. Valida esquema
  antes de tocar nada, guarda respaldo y preserva reglas previas.
- **Esto habilita administración Docker de SUU desde ChatGPT**, después de que
  el agente cargue la política. **No** habilita por sí solo instalaciones futuras
  vía `admin_preparar_operacion(op=instalar_servicio)`; ese permiso requiere una
  entrada válida en el catálogo existente y la actualización del agente o
  política con conocimiento de su esquema real.

## Paso inicial único desde SSH privado del propietario

No pegar claves, credenciales de Tailscale o tokens en ChatGPT.

```bash
ssh estefano@servidordebian.tailef3faa.ts.net
git clone https://github.com/innova-space-edu/suu-3d.git ~/suu-3d
cd ~/suu-3d/deploy/dell-ai
bash admin/bootstrap-suu.sh --dry-run
bash admin/bootstrap-suu.sh --apply
python3 admin/register-suu-docker.py --policy /opt/innova-admin/policy.json
# Inspeccionar salida y aprobar EN SSH:
sudo python3 admin/register-suu-docker.py --policy /opt/innova-admin/policy.json --apply
sudo python3 -m json.tool /opt/innova-admin/policy.json >/dev/null
sudo systemctl restart innova-admin-agent.service
```

Si el agente emplea una ubicación o esquema de política distintos, **detenerse**.
El script no inventa el formato del catálogo: el esquema exacto necesita
inspección del `agent.py` instalado antes de registrar una nueva plantilla.

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
docker ps --filter name='suu-llm'
docker logs --tail 80 suu-llm
sudo journalctl -u innova-admin-agent.service -n 80 --no-pager
sudo tailscale serve status
# Deshacer solo SUU sin tocar los otros servicios:
cd ~/suu-ai && docker compose -f compose.yaml down
# Si se necesita revertir la política:
sudo ls -lt /opt/innova-admin/policy.json.bak.*
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
