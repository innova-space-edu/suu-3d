# SUU 3D — Innova Space Education

Interfaz holográfica conversacional independiente: render 3D en navegador, chat multilingüe con proveedor compatible OpenAI, voz con síntesis de navegador o ElevenLabs, soporte opcional para LiveKit y conectores externos autorizados.

## Inicio

1. Instalar Node.js 22 y ejecutar `npm install`.
2. Copiar `.env.example` a `.env.local`.
3. Establecer `SUU_ACCESS_CODE` y un `SUU_SESSION_SECRET` aleatorio de 32+ caracteres.
4. Establecer proveedor LLM (API key, base URL, model), sin subir secretos a Git.
5. Ejecutar `npm run dev`.

## Seguridad

Todas las claves viven en el servidor; sesión firmada en cookie HTTP-only; validación de origen, límite de solicitudes, límites de entrada; integraciones de solo consulta explícitas. No añadir tokens a variables `NEXT_PUBLIC_`.

## Interfaces

- `/api/session`: estado, inicio/cierre sesión
- `/api/chat`: conversación y consulta contextual de puentes
- `/api/voice`: voz ElevenLabs
- `/api/livekit/token`: credencial temporal para salas LiveKit
- `/api/bridge`: capacidades de plataformas autorizadas

## Modelo 3D

La página principal, el modo de voz y `/face-lab` comparten el rostro anatómico SUU V5 (`public/models/suu-face-anatomical.glb`, base MakeHuman CC0). Se muestran 100.000 puntos en calidad alta y 25.000 en modo económico, con brillo uniforme y una superficie de apoyo. No requiere API ni GPU de servidor. Conserva seguimiento de orientación de cabeza y reacción luminosa al audio; todavía no incluye parpadeo, rig facial ni sincronización de labios. La procedencia y licencia están documentadas en `docs/FACE_LAB.md`.

## Límite actual

La conversación en LiveKit necesita un worker agente externo; la presencia de las tres variables de LiveKit no crea por sí sola un agente. Los puentes EDUAI / ScientificBrain / Visual / Sello requieren endpoints compatibles reales y credenciales de servidor. El modo gráfico y la voz del navegador funcionan aunque estos servicios no estén activados.

Más información: `docs/INTEGRATIONS.md`.

## Biblioteca de voces y respaldo IA

SUU incorpora las voces estándar de EDUAI con Edge TTS, selección por usuario, voces locales del navegador y respaldo ElevenLabs. El motor de lenguaje usa Groq primero y permite SambaNova, OpenRouter y Gemini como proveedores alternativos, sin requerir OpenAI. Las voces privadas clonadas de EDUAI conservan los permisos originales y aún necesitan delegación por usuario.

Consulta [Voces y proveedores](docs/VOICE_PROVIDERS.md) y [.env.example](.env.example).
