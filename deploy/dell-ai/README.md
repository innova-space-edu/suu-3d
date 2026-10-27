# API local del Dell para SUU

Este paquete agrega un servidor de inferencia pequeño mediante llama.cpp, compatible con OpenAI. **No modifica ni reinicia** los contenedores de la intranet.

## Requisitos y límites

- Debian + Docker Compose, red Docker `portal_default` existente.
- Primera prueba: Qwen3.5 0.8B cuantizado Q4_K_M (~0,58 GB de pesos); no hay GPU.
- Reserva máxima del contenedor: 3 GB RAM y 2 CPU, 1 consulta a la vez, contexto 2048 tokens.
- Sigue habiendo latencia CPU y los modelos pequeños pueden equivocarse. Validar en pruebas antes de usar como asistente educativo.

## Integración con el MCP administrativo del Dell

Para el despliegue inicial con comprobaciones de seguridad y el registro
**limitado** del contenedor `suu-llm` en la allowlist del agente administrativo
V12.2, consultar [admin/README.md](admin/README.md). Este procedimiento
mantiene la autorización de cada operación desde Tailscale Serve.
El catálogo de instalaciones nuevas sigue pendiente de compatibilidad
con el esquema real del agente; no se habilita una terminal root genérica.

## Instalación y reparación desde Debian

Usar el aprovisionamiento seguro desde SSH del propietario:

```bash
cd ~/suu-3d && git pull --ff-only
cd deploy/dell-ai
bash admin/bootstrap-suu.sh --dry-run
bash admin/bootstrap-suu.sh --apply
sudo docker ps --filter name=suu-llm
sudo docker logs --tail 40 suu-llm
python3 admin/verify-suu.py
```

Esta versión repara el acceso a la clave API manteniendo los archivos originales.
El contenedor usa un montaje privado de solo lectura y el mismo UID/GID
del propietario del modelo y la clave. El instalador genera el fichero
`~/suu-ai/.env` con esos identificadores numéricos, sin incluir credenciales.
Reconoce y respalda la versión anterior de Compose antes de migrarla.
No dar permisos de lectura públicos a la clave API.

La administración mediante MCP requiere registrar el contenedor en
`/etc/innova-admin/policy.json`. Ver
[admin/README.md](admin/README.md) para los controles previos.

Prueba desde el propio Dell (sustituir temporalmente TOKEN desde el archivo sin imprimirlo):

```bash
KEY="$(cat secrets/suu_api_key.txt)"
curl -fsS http://127.0.0.1:8094/v1/models -H "Authorization: Bearer $KEY"
curl -fsS http://127.0.0.1:8094/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"suu-local","messages":[{"role":"user","content":"Responde hola en español."}],"max_tokens":60}'
unset KEY
```

## Conexión remota de SUU (Vercel → Dell)

1. En la configuración del Cloudflare Tunnel **existente**, crear un hostname **nuevo** que dirija a `http://suu-llm:8080` dentro de `portal_default`. No usar el hostname del MCP y no publicar un puerto directo del host.
2. Restringir el hostname con **Cloudflare Access** y crear un Service Token para Vercel. El enrutador transmite sus credenciales mediante los encabezados `CF-Access-Client-Id` y `CF-Access-Client-Secret`. Evitar reglas de bypass público.
3. En Vercel, configurar `SUU_DELL_API_BASE_URL=https://<hostname-protegido>/v1`, `SUU_DELL_API_TOKEN` igual al contenido del archivo, `SUU_DELL_MODEL=suu-local`, más las dos variables `SUU_DELL_CF_ACCESS_*`. Ninguna usa prefijo `NEXT_PUBLIC_`.
4. Volver a desplegar SUU. Consultar `/api/session` y comprobar que `providers` indica `dell.configured=true`. Esto **no prueba conectividad**: realizar una consulta de voz o chat y comprobar `provider="Servidor Dell"`.
5. Cuando el modelo local falle o demore más de 22 s, SUU intenta proveedores externos configurados en el orden actual.

### Seguridad y operaciones

- Mantener la API con **doble control**: Cloudflare Access más llave de llama.cpp. No exponer `127.0.0.1:8094` al exterior.
- `/v1/models` puede ser público para llama.cpp; el túnel completo debe permanecer tras Access.
- No enviar directamente desde el navegador las credenciales ni el endpoint de inferencia.
- La nueva API sirve **texto únicamente**: no instala TTS ni cambia voces, cámara o movimiento de boca.
- El MCP Dell v12.2 no incluye el contenedor SUU en su catálogo de instalaciones autorizadas. Este paso exige SSH / una actualización de su lista de despliegues autorizados.
- Para detener solamente este servicio: `sudo docker compose -f compose.yaml down` desde la carpeta.

## Probar un modelo de mayor capacidad

Para comparar y activar Qwen3-4B-Instruct-2507 Q5_K_M conservando el perfil actual,
consultar [MODEL_TRIAL.md](MODEL_TRIAL.md). El ensayo valida recursos e integridad,
usa un puerto temporal y separa la comparación de la activación en producción.
