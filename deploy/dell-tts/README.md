# SUU Piper TTS privado · Dell Debian

## Qué instala
- **Motor:** Piper TTS 1.8.0 (Open Home Foundation), sintetizador neuronal local
  por CPU (GPL-3.0-or-later).
- **Voz:** Daniela, español argentino, calidad alta, `es_AR-daniela-high`,
  ~114 MB, con config ONNX. Descarga única, ejecución sin conexión a proveedores.
- **Contenedor:** `suu-tts`, independiente de `suu-stt` y `suu-llm`.
- **Puerto:** solo `127.0.0.1:8096`. No publicarlo directamente.
- **Recursos:** hasta 1 CPU, 1 GiB RAM, una solicitud simultánea.
- **Seguridad:** rootfs solo lectura, capacidades eliminadas, uid/gid
  propietario, voz ONNX read-only, clave separada y permisos 0600.
- **Privacidad:** audio y texto residen en memoria; no se guardan en logs.
- **Licencia de voz:** revisar la [tarjeta de modelo Daniela](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_AR/daniela/high/MODEL_CARD),
  cuyo dataset indica CC BY-SA 4.0. La distribución/uso comercial del
  motor y de pesos pueden tener obligaciones de licencia adicionales.

## 1. Instalar sin interferir con servicios actuales
En la sesión SSH del propietario de Debian:

```bash
cd ~/suu-3d && git pull --ff-only
cd deploy/dell-tts
bash bootstrap.sh --dry-run
bash bootstrap.sh --apply
sudo docker ps --filter name=suu-tts
curl -fsS http://127.0.0.1:8096/health
sudo docker logs --tail 25 suu-tts
```

El bootstrap crea `~/suu-tts/models`, `~/suu-tts/secrets` y
`~/suu-tts/.env`, genera `secrets/tts_api_key.txt` solo si no existe,
descarga el modelo únicamente si falta y levanta `suu-tts`.
Nunca ejecutar el script con `sudo bash`. No borrarlo para reintentar.
El instalador no sobrescribe archivos locales alterados.

## 2. Cloudflare Access
Antes de publicar una ruta, crear una nueva aplicación Access
**Self-hosted** para `suu-tts.innova-space-edu.cl`.
- Política: `Service Auth`, **Include** únicamente el token existente
  `SUU-Vercel`. Sin política Allow/Bypass pública.
- Return 401 Response: habilitado.
- Copiar su AUD propio de esa nueva aplicación (no el de STT o Qwen).

Crear una nueva ruta publicada en el túnel existente `intranet-dell`:
- Hostname: `suu-tts.innova-space-edu.cl`
- Servicio Docker: `http://suu-tts:8096` (red `portal_default`)
- Protect with Access: ON, AUD: el nuevo AUD de `SUU-TTS`
- Team name: `orange-snowflake-d921`

Una solicitud anónima a `https://suu-tts.innova-space-edu.cl/health`
DEBE ser rechazada por Access (401/403 o pantalla Access), no mostrar JSON.

## 3. Vercel `suu-3d`
En **Settings → Environment Variables**, Production:
- `SUU_TTS_API_BASE_URL` = `https://suu-tts.innova-space-edu.cl`
- `SUU_TTS_API_TOKEN` = contenido secreto en
  `~/suu-tts/secrets/tts_api_key.txt`, tipo Sensitive.
- `SUU_DELL_CF_ACCESS_CLIENT_ID` y
  `SUU_DELL_CF_ACCESS_CLIENT_SECRET`: reutilizar las existentes.

No subir claves a GitHub ni copiar al chat. Crear las dos variables nuevas
solo cuando Cloudflare proteja efectivamente el endpoint; después desplegar
Production nuevamente para que Vercel cargue las variables.

## 4. Prueba con SUU
Abrir `https://suu-3d.vercel.app`, iniciar sesión, entrar a Configuración.
La voz **Automática** usa Piper cuando `ttsLocal` esté configurado.
La opción explícita **Daniela · Piper Dell** también está disponible.

En modo solo voz, hacer una pregunta. Flujo:
micrófono → Whisper Dell (STT) → Qwen Dell (LLM) → Piper Dell (TTS)
→ WAV al navegador → animación labial aproximada por duración.

Si Piper falla o está deshabilitado, SUU recupera la voz instalada del
navegador; EDUAI sigue disponible según el modo elegido. A diferencia de
Edge TTS, Piper no entrega marcadores fonéticos de palabra; la boca se
sincroniza mediante estimación temporal, no por fonemas exactos.

## Prueba de salud y mantenimiento
```bash
curl -fsS http://127.0.0.1:8096/health
sudo docker ps --filter name=suu-tts
sudo docker logs --tail 40 suu-tts
```

Para detener solo Piper:
```bash
cd ~/suu-tts && sudo docker compose stop suu-tts
```

No ejecutar `docker compose down` sobre la intranet, Qwen o Whisper.
# Optimización de instalación existente

Desde la copia actualizada del repositorio, ejecutar como usuario propietario:

```bash
bash deploy/dell-tts/upgrade.sh --dry-run
bash deploy/dell-tts/upgrade.sh --apply
curl -fsS http://127.0.0.1:8096/health
sudo docker exec suu-tts python /app/benchmark.py
```

`upgrade.sh` conserva los modelos, la clave y `.env`, respalda los archivos de
servicio y reconstruye solamente `suu-tts`. No usar `bootstrap.sh` para actualizar:
su protección contra sobrescrituras es deliberada. La nueva salud informa
`threads: 1` y `optimized: true` después del precalentamiento.

Para comparar antes de actualizar, se puede ejecutar el benchmark nuevo por stdin:
`sudo docker exec -i suu-tts python - < deploy/dell-tts/benchmark.py`.
Usar las mismas condiciones de carga en ambas mediciones, sin otra conversación
activa. El benchmark hace seis síntesis y no guarda ni imprime texto o claves.
RTF = tiempo de síntesis / duración de audio: por encima de 1 habrá pausas aunque
se divida el texto. Por debajo de 0,5 deja margen para red y Qwen.

La sesión ONNX es persistente, secuencial, con un hilo y sin espera activa,
ajustada al límite de una CPU del contenedor. `OMP_NUM_THREADS` por sí solo no
configura los hilos propios de ONNX. No aumentar núcleos o cambiar de voz hasta
comparar el RTF; aumentar núcleos de Piper puede perjudicar Qwen e intranet.
El proxy expone `Server-Timing`, `X-Suu-Synthesis-Rtf` y
`X-Suu-Audio-Seconds` para separar cómputo local y tiempo total de ida y vuelta.

La web aún recibe la respuesta completa de Qwen antes de iniciar Piper. La
fragmentación reduce la espera de voz, pero no elimina esa espera inicial.
La sincronización labial de Piper sigue siendo estimada por texto y duración,
anclada al reloj del audio; no es alineación fonética real.
