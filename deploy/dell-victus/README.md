# SUU: texto en Victus, puerta autenticada y Piper en Dell

Activa el flujo existente Vercel -> Cloudflare -> Dell:8094 -> Victus:11434,
con respuestas JSON y SSE compatibles con OpenAI. Conserva `suu-local`, la
clave privada y el puerto de entrada; mapea a `suu-victus-4b-q4`. Piper sigue
en 8096 y STT en 8095; no modifica esos servicios, Vercel ni Cloudflare.

## Aplicar desde el Dell

Ejecutar como propietario, sin sudo delante de Python y sin conversaciones
activas. Docker puede pedir sudo. El modelo estable debe existir en el Victus.

```bash
cd ~/suu-3d
git fetch origin
git switch main
git pull --ff-only origin main
python3 deploy/dell-victus/install.py --apply
```

Sin `--apply` solo muestra el plan. El instalador:

1. Verifica archivos/propietario, UID/GID y Compose conocido; conserva perfiles
   personalizados. No imprime ni pasa la clave como argumento de proceso.
2. Construye una imagen con etiqueta derivada del contenido del puente.
3. Prueba contenedor limitado temporal en 127.0.0.1:8097. Comprueba conectividad
   desde Docker, precarga y SSE autenticado antes de modificar el motor activo.
4. Elimina el candidato; respalda Compose y hash del entorno en carpeta privada.
5. Reemplaza solo `suu-llm` usando el mismo puerto 8094 y red portal_default.
   Reduce su limite a 0,5 CPU y 384 MiB: ya no ejecuta inferencia en el Dell.
6. Repite salud/backend y prueba SSE. Si falla o se interrumpe de forma capturable,
   restaura el Compose anterior y reinicia solo ese servicio.

No borra pesos del Dell ni modelos del Victus. No modifica `.env`. Conserva
imagenes anteriores para reversion. Imprime el comando exacto de rollback:

```bash
python3 deploy/dell-victus/install.py --rollback RUTA_REAL_DEL_RESPALDO --apply
```

La reversion rechaza respaldos modificados o cambios del entorno posteriores.
Se restaura la configuracion previa con las imagenes locales disponibles.
No ejecutar el bootstrap inicial del LLM para alternar perfiles.

## Comportamiento del puente

La clave del Dell se verifica en entrada y nunca se envia a Ollama. Upstream
queda limitado a una URL HTTP IPv4 Tailscale en puerto 11434 y al modelo fijo.
No ofrece proxy arbitrario. Limita entradas/salidas, procesa una conversacion
a la vez y rechaza saturacion con 429. No registra texto ni credenciales.
No publica una API nueva hacia internet: solo el loopback ya configurado.

Precarga con `/api/generate` y `keep_alive:-1`; cada `/api/chat` repite ese
valor para evitar la descarga automatica por inactividad. Esto retiene memoria
mientras Ollama mantenga el modelo disponible. No evita recarga tras reiniciar
el Victus/Ollama, ni convierte Ollama en servicio de Windows. Usa contexto 2048,
cuatro hilos CPU auxiliares, temperatura y limite de tokens recibidos de SUU
(maximo 256; SUU actualmente solicita 96). La carga GPU sigue gestionada por
Ollama, no se fuerza una configuracion distinta a la ensayada.

El stream transmite solo `message.content`, no razonamiento oculto; conserva
UTF-8, cierre y errores. No emite un final exitoso en respuestas truncadas.
Cierra upstream y libera el turno cuando se cancela el stream. Si Victus falla,
devuelve error: el router de proveedores de SUU puede usar sus respaldos ya
configurados antes de emitir texto. No mezcla respuestas ni usa silenciosamente
el modelo 0,8B. El estado de salud indica el ultimo contacto/precalentamiento,
no una comprobacion continua de disponibilidad del Victus.

## Verificacion real pendiente del propietario

Tras aplicar, pegar salida del instalador y abrir SUU con recarga completa,
seleccionar Piper Dell y preguntar algo de varias frases. Verificar que el texto
empiece pronto, la voz no tenga pausas largas y los labios sigan cada clip.
Network debe mostrar chat NDJSON y Piper audio/wav 200. Los logs del navegador
`[SUU conversation timing]` permiten medir `firstTextMs`, `firstPhraseMs`,
`firstAudioMs`, `chatDoneMs` y `voiceInterrupted`. No pegar cookies ni cabeceras
de autorizacion. La prueba previa Dell -> Victus -> Piper midio primer WAV
1,92–2,83 s, pero no incluye la ruta de Vercel ni reproduccion real.

SSH, energia y arranque desatendido de Windows siguen siendo pasos separados.
El conector MCP actual no permite ejecutar este instalador ni SSH del anfitrion;
la primera aplicacion se realiza en la terminal del propietario.

Fuentes: https://docs.ollama.com/api/chat y https://docs.ollama.com/faq .
