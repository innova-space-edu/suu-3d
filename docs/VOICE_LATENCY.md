# Latencia de conversación

El modo Piper en español (Automática o voz del Dell) solicita `/api/chat` con
`stream: true`. El proxy lee SSE compatible con OpenAI y envía eventos NDJSON:
`delta`, `done` y `error`. El cliente forma frases de hasta 90/150 caracteres,
solicita la primera síntesis sin esperar el texto final y prepara como máximo un
clip siguiente mientras reproduce el actual. Se mantiene el límite existente de
700 caracteres hablados; el chat recibe la respuesta completa.

Se conserva el flujo JSON para otras voces, sonido desactivado y catálogo Expo.
Si una versión anterior devuelve JSON, el cliente lo acepta. No se modifican
la configuración de Qwen, el perfil Sharvard, Docker, Cloudflare ni las claves.

La cola es privada de cada conversación y acotada por el límite de texto hablado.
Detener la conversación cancela la lectura de Qwen y las peticiones de audio.
Un fallo de voz antes de empezar permite la voz de respaldo; después de empezar
no repite la respuesta entera. Un fallo del proveedor tras emitir texto termina
la respuesta con un error, sin sustituirla por otra respuesta de otro proveedor.
Las pistas labiales siguen el reloj y la duración de cada clip, sin animar voz
antes de que comience el audio. El modo manos libres vuelve a escuchar solamente
al terminar la reproducción, no al terminar la generación de texto.

## Medición

En la consola del navegador, `[SUU conversation timing]` muestra:

- `firstTextMs`: primera porción de texto recibida.
- `chatDoneMs`: respuesta textual completa recibida.
- `firstAudioMs`: primer evento `playing` real, o `null` si no hubo reproducción.
- `voiceInterrupted`: si se interrumpió la canalización de voz.

Los tres tiempos empiezan al iniciar la petición de conversación; no incluyen la
captura/transcripción del micrófono. Una primera reproducción anterior a
`chatDoneMs` confirma que la voz se solapa con la generación de Qwen. Si la
respuesta consta de una sola frase, puede no existir ese solapamiento.

En los registros de Vercel:

- `[SUU chat timing]`: proveedor, primer texto y tiempo total de generación del
  proveedor; excluye la consulta previa a puentes y la reproducción del cliente.
- `[SUU Piper timing]`: tiempo total del proxy hacia el Dell, milisegundos de
  síntesis local, RTF y segundos de audio. La diferencia incluye túnel, red,
  transferencia y procesamiento del proxy; no mide solo Cloudflare.

No se registran preguntas, respuestas, audio, cookies o credenciales. Los
encabezados `Server-Timing`, `X-Suu-Synthesis-Rtf` y `X-Suu-Audio-Seconds` siguen
visibles en las respuestas `/api/piper` de Network.

## Verificación

Las pruebas simulan SSE dividido por bytes (incluido UTF-8), transmisión
incompleta, cancelación, fallback antes/después del primer texto y el flujo del
cliente: el primer audio debe arrancar mientras la respuesta de Qwen aún está
abierta. Verifican el orden de clips y la liberación de URLs. No sustituyen una
medición en el Dell. La síntesis y Qwen ahora pueden usar CPU a la vez; comparar
los tiempos reales antes de afirmar una reducción concreta de latencia total.
