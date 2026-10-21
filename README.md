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

La cabeza procedural no requiere API ni GPU de servidor. Para usar un modelo de Blender de alta fidelidad, exportar glTF/GLB con blendshapes ARKit y configurar `NEXT_PUBLIC_SUU_HEAD_MODEL=/models/suu-head.glb`, colocando el archivo con derechos de uso en `public/models`. La estética de partículas translúcidas está inspirada en la imagen de referencia sin incluir material de terceros.

## Límite actual

La conversación en LiveKit necesita un worker agente externo; la presencia de las tres variables de LiveKit no crea por sí sola un agente. Los puentes EDUAI / ScientificBrain / Visual / Sello requieren endpoints compatibles reales y credenciales de servidor. El modo gráfico y la voz del navegador funcionan aunque estos servicios no estén activados.

Más información: `docs/INTEGRATIONS.md`.
