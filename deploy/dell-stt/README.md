# SUU STT local por CPU · Dell Debian

Estado inicial: **código preparado, no instalado en el anfitrión**. El MCP V12.2
tiene el catálogo de instalaciones vacío, por lo que el primer aprovisionamiento
requiere SSH autorizado del propietario. No activar endpoint Vercel antes
de asegurar el túnel y generar el secreto privado.

## Arquitectura

Navegador (MediaRecorder, voz detectada y duración máxima 15 s)
→ POST autenticado `/api/stt` (Vercel Next.js; máximo 2.5 MB)
→ Cloudflare Access (Service Auth con el token ya usado por Vercel)
→ Cloudflare Tunnel protegido `suu-stt.innova-space-edu.cl`
→ `http://suu-stt:8095/transcribe` en red Docker `portal_default`
→ modelo Whisper **base**, CPU INT8, 2 hilos, 1 ejecución simultánea.

- Servicio separado de `suu-llm` (Qwen), puertos solo `127.0.0.1` en el anfitrión.
- Docker: máximo 2 CPU, 2 GiB RAM, `read_only`, `cap_drop: ALL`,
  `no-new-privileges`, `pids_limit: 96`.
- El token de la API STT está en `~/suu-stt/secrets/stt_api_key.txt`, permisos 0600.
- El modelo se descarga una vez a `~/suu-stt/models`; después opera con `HF_HUB_OFFLINE=1`.
- No se almacenan audios ni transcripciones; no se registran cuerpos de peticiones.
- No transcribe continuamente en servidor: se envían frases completas, con detección
  de silencio en el navegador y duración corta para reducir carga CPU.
- Si STT no está configurado o falla, SUU utiliza el reconocimiento del navegador
  (puede depender de servicios remotos según el navegador).
- TTS de respuesta utiliza prioritariamente una voz instalada en el equipo, ya existente.

## Reparación del primer intento fallido (PyAV)

La primera ejecución del 27-10-2026 se detuvo durante la construcción de
la imagen `python:3.11-slim`: `pip` intentó compilar `av==14.4.0`
desde el paquete fuente y faltaron herramientas de desarrollo/FFmpeg 7.

**Corrección:** `av==16.0.1` dispone de wheel precompilado
`cp311-manylinux_2_28` para Linux x86_64/ARM64. El Dockerfile usa
`pip install --only-binary=:all:` para evitar compilaciones fuente
accidentales: el error por ausencia de un wheel compatible será explícito.

El instalador reconoce **únicamente** los cinco archivos originales
de la revisión `9d9bcec1` que copió al primer intento fallido, respalda
las diferencias reconocidas, y actualiza los archivos de configuración.
Rechaza archivos personalizados y enlaces simbólicos.

Se preservan `~/suu-stt/models`, `~/suu-stt/.env` y
`~/suu-stt/secrets/stt_api_key.txt`. La clave STT no se genera
nuevamente si ya existe. No borrar esa carpeta ni repetir con `sudo bash`.

Para recuperar:

```bash
cd ~/suu-3d
git pull --ff-only
cd deploy/dell-stt
bash bootstrap.sh --dry-run
bash bootstrap.sh --apply
sudo docker ps --filter name=suu-stt
curl -fsS http://127.0.0.1:8095/health
```

La primera instalación termina solo cuando la imagen construye, el
modelo está cacheado y el contenedor comienza a ejecutarse.
Si aparece otro error de dependencias, conservar el log sin credenciales.

## Reparación de la caché Xet de Hugging Face en contenedor de solo lectura

En el segundo intento la imagen Docker se construyó, pero durante
`WhisperModel("base")` Hugging Face Xet intentó escribir
`/.cache/huggingface/xet/logs` fuera del volumen persistente.

La configuración corregida conserva `read_only: true` y dirige
`HOME`, `HF_HOME`, `HF_XET_CACHE` y `XDG_CACHE_HOME` dentro
del montaje **escribible** `~/suu-stt/models:/models`.
No se necesita dar permisos de escritura sobre la raíz ni pasar
credenciales de Hugging Face: el modelo base es público y una advertencia
sobre solicitudes sin `HF_TOKEN` no implica que la descarga falle.

`bootstrap.sh` reconoce tanto los archivos originales del primer intento
como los del commit `69fc4139`; respalda únicamente diferencias que
coincidan exactamente con las versiones conocidas. No sobrescribe archivos
personalizados, no borra archivos de modelo parcialmente descargados y
conserva el token.

Reintentar:

```bash
cd ~/suu-3d && git pull --ff-only
cd deploy/dell-stt
bash bootstrap.sh --dry-run
bash bootstrap.sh --apply
sudo docker ps --filter name=suu-stt
curl -fsS http://127.0.0.1:8095/health
```

## 1. Instalar exclusivamente STT en Debian

```bash
cd ~/suu-3d && git pull --ff-only
cd deploy/dell-stt
bash bootstrap.sh --dry-run
bash bootstrap.sh --apply
sudo docker ps --filter name=suu-stt
curl -fsS http://127.0.0.1:8095/health
```

`--dry-run` solo valida. `--apply` crea un token distinto del de Qwen,
construye la imagen CPU, cachea el modelo y levanta únicamente `suu-stt`.
El primer build requiere salida HTTPS para instalar bibliotecas y obtener el modelo.
Si existe una instalación local diferente, el script **aborta** sin sobrescribirla.

Para inspeccionar errores:

```bash
sudo docker logs --tail 60 suu-stt
sudo docker inspect suu-stt --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'
```

No habilitar `chmod 644` sobre las claves, no publicar el puerto 8095, no
modificar el grupo `docker` y no copiar el token a chats.

## 2. Crear un hostname protegido en Cloudflare Zero Trust

Usar el túnel existente `intranet-dell`. Crear primero una **nueva aplicación
Access Self-hosted** para `suu-stt.innova-space-edu.cl`, con política
`Service Auth` que incluya *solo* el service token `SUU-Vercel` ya creado.
Obtener el **AUD** de esa nueva aplicación.

Después agregar al túnel la ruta publicada:
- **Hostname:** `suu-stt.innova-space-edu.cl`.
- **Service type:** HTTP.
- **Service URL:** `http://suu-stt:8095`.
- **Protect with Access:** ON.
- **AUD:** el AUD de la aplicación `suu-stt`, NO el de `suu-api`.
- **Team name:** el mismo Team name de Zero Trust ya configurado.

No modificar `suu-api`, `intranet` ni las rutas existentes.
Probar desde una ventana privada que
`https://suu-stt.innova-space-edu.cl/health` **no responda** sin Access.
Un 401 o 403 es el resultado esperado sin autenticación.

## 3. Configurar en Vercel (Production)

En el proyecto existente `innova-space-edu/suu-3d`, agregar:

| Variable | Valor |
| --- | --- |
| `SUU_STT_API_BASE_URL` | `https://suu-stt.innova-space-edu.cl` |
| `SUU_STT_API_TOKEN` | Contenido **privado** de `~/suu-stt/secrets/stt_api_key.txt` |
| `SUU_DELL_CF_ACCESS_CLIENT_ID` | **Ya existente**: se reutiliza |
| `SUU_DELL_CF_ACCESS_CLIENT_SECRET` | **Ya existente**: se reutiliza |

Solo se necesita agregar las dos variables `SUU_STT_*`. No mostrar el token
en GitHub, en terminal compartida ni en imágenes; copiarlo directamente a
Vercel desde SSH del propietario. Vercel tiene que volver a desplegarse
después de agregar las variables, porque las instancias cargan un snapshot.

## 4. Prueba funcional

Desde SUU web autenticado, iniciar modo voz. El navegador pide micrófono,
graba temporalmente hasta detectar silencio y envía audio a `/api/stt`.
Después responde el Qwen del Dell, y una voz del dispositivo habla.

En Vercel debería verse `POST /api/stt` (sin transcripción en logs)
y en Dell `suu-stt` saludable.

Para pruebas de seguridad:
- Sin sesión SUU: `/api/stt` devuelve HTTP 401.
- Sin Access: hostname público debe bloquear acceso.
- Audio corrupto, >2.5 MB o >17 s: rechazo con HTTP 400/413.
- No se admiten idiomas fuera de es/en/pt/fr.
- Un solo trabajo de inferencia simultáneo; en carga extra responde 429.
- En un fallo de STT, el navegador puede recuperarse con SpeechRecognition.

## Mantenimiento

Para detener solo STT:
```bash
cd ~/suu-stt
sudo docker compose stop suu-stt
```

No eliminar la carpeta `models`: contiene el modelo cacheado. No ejecutar
`docker compose down` de la intranet ni reiniciar los servicios de Qwen/MCP.
