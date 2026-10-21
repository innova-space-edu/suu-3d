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
SAMBANOVA_MODEL_SUU=
OPENROUTER_API_KEY_SUU=
OPENROUTER_MODEL_SUU=
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
