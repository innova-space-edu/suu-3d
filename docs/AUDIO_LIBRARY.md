# Voces y biblioteca de SUU

Selecciona **Biblioteca · crear y reutilizar** en la lista de modos. Permite generar por fragmentos, reproducir, descargar WAV/MP3 y borrar copias locales. Se guardan automáticamente los audios generados en IndexedDB (hasta 500 clips/160 MB). Si el navegador impide persistir, descarga el audio; el modo privado puede borrar datos al cerrar. No se graban micrófonos.

Feria conserva su narración preparada y no activa micrófono. Conversación guarda respuestas por pregunta **e historial completo, dominio y estilo**; no hace coincidencias aproximadas que puedan devolver respuestas de otro contexto. El audio se identifica por texto, voz e idioma. Cambiar el modelo/voz del servicio Piper requiere regenerar los audios de esa voz.

## Microsoft y EduAI

La implementación inspeccionada de EduAI usa Gemini para narrar y Microsoft Edge TTS como respaldo. SUU ofrece Dalia (México), Elvira (España), Catalina (Chile), entre otras. Edge TTS usa `@andresaya/edge-tts`, requiere internet y no solicita una clave Azure; no equivale al servicio contractual de Azure ni tiene garantía de disponibilidad. No consume la GPU del Victus. Dalia es la primera comparación recomendada para español mexicano.

Azure Speech oficial se habilita solo con `AZURE_SPEECH_KEY` y `AZURE_SPEECH_REGION`. Tiene cuota/tarifa propia. No se copian claves de EduAI.

| Motor | Configuración en Vercel | Consideración |
| --- | --- | --- |
| Microsoft Edge | Ya integrado | Online; sin clave adicional |
| Azure Speech | AZURE_SPEECH_KEY, AZURE_SPEECH_REGION | Servicio oficial; cuota de cuenta |
| Gemini | GEMINI_TTS_API_KEY o GEMINI_API_KEY_SUU; SUU_GEMINI_TTS_MODEL opcional | Modelo predeterminado gemini-2.5-flash-preview-tts; disponibilidad/cuota de cuenta |
| OpenRouter | OPENROUTER_API_KEY_SUU, SUU_OPENROUTER_TTS_MODEL, SUU_OPENROUTER_TTS_VOICE opcional | Requiere modelo TTS explícito; no se presume gratuito |
| Groq | GROQ_API_KEY | Austin/Orpheus solo inglés; no usar para español |
| SambaNova | SAMBANOVA_API_KEY_SUU | Texto; no se anuncia síntesis de voz |
| Piper Dell | Configuración SUU_TTS existente | Local; permanece operativo |
| Victus TTS | SUU_VICTUS_TTS_API_BASE_URL, SUU_VICTUS_TTS_API_TOKEN | Adaptador preparado; requiere instalar servicio compatible /synthesize y HTTPS protegido; no instalado por este cambio |

Las claves son únicamente variables de servidor, nunca NEXT_PUBLIC. Tener una clave configurada no demuestra que su cuota/modelo funcione. No hay cambio automático a un proveedor de pago.

## Archivo persistente en Dell

La biblioteca del navegador funciona sin actualizar Docker. Para habilitar además copias automáticas al Dell, el propietario debe ejecutar, después de fusionar:

```bash
cd ~/suu-3d
git fetch origin
git switch main
git pull --ff-only origin main
bash deploy/dell-tts/upgrade.sh --apply
```

Después de comprobar el contenedor saludable, establecer `SUU_AUDIO_LIBRARY_ENABLED=true` en Vercel y volver a desplegar. Reutiliza el token y Cloudflare Access del Piper existente. No activar antes de actualizar el servicio. No requiere reinstalar voces.

Los nuevos clips se copian en segundo plano; si falla, se conserva la copia local y puede repetirse con **Copiar al Dell**. Audios anteriores se copian manualmente. **Recuperar copia** descarga un audio archivado para reutilizarlo en otro navegador. El archivo comparte permisos con el acceso a SUU: no habilitarlo si las respuestas son privadas de usuarios diferentes.

Ruta del propietario: `~/suu-tts/library`. Registros JSON con metadatos y audio base64, archivos privados 0600 y escritura atómica; límite 500 registros/220 MB. No es el sistema efímero de archivos de Vercel. Eliminar copia local no elimina el archivo Dell. Los errores de archivo no bloquean la conversación.

## Validación

Las pruebas de adaptadores usan respuestas simuladas, no consumen cuotas ni prueban voces reales. La voz en Victus y los motores online nuevos deben medirse tras configurar sus servicios. La biblioteca conserva sincronización estimada cuando el motor no devuelve tiempos por palabra.
