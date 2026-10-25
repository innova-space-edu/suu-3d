# SUU · Voces y proveedores de IA

## Prioridad de IA

SUU intenta en orden: (1) Groq, (2) SambaNova, (3) OpenRouter, (4) Gemini.
Cada proveedor usa credenciales distintas. Si falla o agota cuota, intenta el siguiente habilitado (máximo cuatro solicitudes por pregunta; timeout 11 segundos por proveedor).
El nombre del proveedor que respondió se muestra en la interfaz. Los secretos nunca llegan al navegador.

### Groq como primera opción (sin OpenAI)
```dotenv
GROQ_API_KEY=          # https://console.groq.com/keys
GROQ_MODEL=llama-3.3-70b-versatile
```
Si previamente ingresaste Groq en `SUU_LLM_API_KEY` con `SUU_LLM_BASE_URL=https://api.groq.com/openai/v1` y `SUU_LLM_MODEL`, se reutiliza de forma automática.
No se requiere ninguna cuenta o API key de OpenAI.

### Respaldos opcionales
```dotenv
SAMBANOVA_API_KEY_SUU=
SAMBANOVA_MODEL_SUU=Meta-Llama-3.3-70B-Instruct
OPENROUTER_API_KEY_SUU=
OPENROUTER_MODEL_SUU=meta-llama/llama-3.3-70b-instruct
GEMINI_API_KEY_SUU=
GEMINI_MODEL_SUU=gemini-2.5-flash
```
SambaNova: https://cloud.sambanova.ai/apis
OpenRouter: https://openrouter.ai/settings/keys
Gemini: https://aistudio.google.com/apikey

Los nombres de modelo deben existir en la cuenta respectiva. Puedes colocar primero solo Groq y agregar otros cuando quieras.
Las variables alternativas sin sufijo `_SUU` (`SAMBANOVA_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`) se aceptan por compatibilidad, pero se recomienda una clave exclusiva de SUU.

## Biblioteca de voz disponible

SUU incluye las **seis voces seleccionables en EDUAI Audio Lab**:
- Catalina (es-CL) · voz empleada también por MIRA
- Lorenzo (es-CL)
- Álvaro (es-ES)
- Elvira (es-ES)
- Jorge (es-MX)
- Dalia (es-MX)

Añade también las **dos voces adicionales identificadas en el mapa de narración EDUAI**:
- Alonso (es-US)
- Paloma (es-US)

Las ocho voces se sintetizan con Edge TTS desde el servidor de SUU y no necesitan clave adicional. El selector incluye además todas las voces que exponga el navegador del usuario. SUU prueba Edge TTS primero; si falla y se configuró ElevenLabs, utiliza la voz de respaldo allí; en caso de fallo de ambos, usa la voz local del navegador.

Para añadir ElevenLabs opcional:
```dotenv
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

### Voces privadas replicadas en EDUAI
**No se copian ni enumeran desde SUU con una clave administrativa compartida.** Los perfiles personales de EDUAI Audio Lab requieren propietario autenticado, consentimiento de clonación, administrador adulto y un segundo factor (AAL2) para la zona protegida. Unir esas voces a SUU exige primero implementar una delegación por cuenta, permisos limitados, revisión de consentimientos y la pasarela autorizada en EDUAI. No se debe copiar el bucket `voice-clones`, perfiles ni usar la service role para omitir esas barreras. Se mantiene el acceso por EDUAI mientras tanto.

## Seguridad

Configura las claves en Vercel → Settings → Environment Variables, Production. No edites `.env.example` con valores privados ni subas `.env.local` a GitHub. Redeploy para que se apliquen cambios. Los servicios de TTS Edge dependen de conectividad de la plataforma y no garantizan disponibilidad continua.

## Diagnóstico de servicios

El panel distingue configuración de disponibilidad: una clave guardada no demuestra que tenga permisos o saldo. Los cuatro proveedores tienen un modelo predeterminado y se habilitan al configurar su clave. Un fallo informa proveedor y código HTTP sin devolver claves ni cuerpos de error externos.

LiveKit es independiente de estas cuatro IA y requiere su propio agente externo. Antes de entregar un token, el servidor hace una consulta de salas de solo lectura para validar las credenciales. La URL, API key y secret deben ser del mismo proyecto. La cámara está permitida para el propio sitio y solo se activa con el botón del usuario.

V5 tiene movimiento de cabeza más visible y seguimiento de orientación cuando se detecta una cara. No tiene aún rig de labios, párpados ni expresiones.


## Reducción de ruido del micrófono

La opción “Reducir ruido de fondo” está activada de inicio y se aplica al pulsar el micrófono, no al abrir la página. Usa `noiseSuppression:true` y cancelación de eco, con `autoGainControl:false` y `voiceIsolation:false`; no añade una puerta de ruido ni un aislador neuronal. No separa varias personas hablando ni permite elegir una intensidad exacta: el algoritmo lo controla el navegador. Si afecta voces suaves, puede desactivarse.

Chrome/Edge de escritorio 135+ reciben la pista capturada en `SpeechRecognition.start(track)`. En móviles, Safari y otros navegadores no compatibles se conserva el reconocimiento nativo y la interfaz indica que la entrada la gestiona el navegador; no se anuncia un filtro verificado allí. LiveKit recibe las mismas opciones al conectar el micrófono. Detener, cerrar o cancelar una captura pendiente libera sus pistas. Cambiar la preferencia se aplica en la próxima activación.

Referencia: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start y https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html .


## Texto para lectura en voz alta

La voz recibe una versión sin marcas de Markdown: negritas, cursivas, títulos, viñetas, enlaces, tablas y adornos no se leen como símbolos de formato. Los bloques de código se anuncian como disponibles en el chat, evitando narrar su puntuación. El chat conserva su texto original. Números, porcentajes y operadores relevantes no se borran indiscriminadamente. La limpieza se aplica antes de sintetizar en Edge/ElevenLabs y en la voz del navegador, y el texto limpio también alimenta la sincronización labial de respaldo.
