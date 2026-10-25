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

La página principal, el modo de voz y `/face-lab` comparten el rostro anatómico SUU V5 (`public/models/suu-face-anatomical.glb`, base MakeHuman CC0). Se muestran 100.000 puntos en calidad alta y 25.000 en modo económico, con brillo uniforme y una superficie de apoyo. No requiere API ni GPU de servidor. Conserva seguimiento de orientación de cabeza y reacción luminosa al audio; incluye un rig inicial de nueve controles, parpadeo y apertura de boca por amplitud del audio. La alineación precisa de labios por fonemas queda pendiente. La procedencia y licencia están documentadas en `docs/FACE_LAB.md`.

## Límite actual

La conversación en LiveKit necesita un worker agente externo; la presencia de las tres variables de LiveKit no crea por sí sola un agente. Los puentes EDUAI / ScientificBrain / Visual / Sello requieren endpoints compatibles reales y credenciales de servidor. El modo gráfico y la voz del navegador funcionan aunque estos servicios no estén activados.

Más información: `docs/INTEGRATIONS.md`.

## Biblioteca de voces y respaldo IA

SUU incorpora las voces estándar de EDUAI con Edge TTS, selección por usuario, voces locales del navegador y respaldo ElevenLabs. El motor de lenguaje usa Groq primero y permite SambaNova, OpenRouter y Gemini como proveedores alternativos, sin requerir OpenAI. Las voces privadas clonadas de EDUAI conservan los permisos originales y aún necesitan delegación por usuario.

Consulta [Voces y proveedores](docs/VOICE_PROVIDERS.md) y [.env.example](.env.example).


## Modo Expo Ciencias 2026

Inicia sesión y abre **Modo feria**. El mismo botón ofrece **Bienvenida** (recepción con cámara y recorridos) y **Normal · preguntas y guía** (conversación sobre las exposiciones y otras consultas, sin cámara, recorridos ni saludos automáticos). En Normal, pulsa el micrófono para empezar; abrirlo no activa dispositivos. **Cambiar modo de feria** permite volver a elegir y detiene los dispositivos de la modalidad anterior.

Al elegir Bienvenida, cada apertura muestra una ventana con los pasos. Si hay recorridos guardados, puedes usar esa configuración sin enseñarlos de nuevo o elegir **Enseñar recorridos de nuevo** si cambiaste el lugar o la cámara. No se activa ningún dispositivo al abrirlo.

1. Coloca el PC y la cámara en el acceso definitivo y activa la cámara de prueba.
2. Con una sola persona visible, pulsa **Enseñar entrada** y recorre el acceso durante seis segundos. Repite con **Enseñar salida** en sentido contrario.
3. Para recorridos nuevos, haz ambos otra vez sin voz. Comprueba las etiquetas de entrada y salida. Si elegiste usar la configuración guardada en el mismo lugar, puedes activar la feria sin repetir la enseñanza.
4. **Activar feria con audio** inicia la escucha de preguntas y los saludos automáticos. **Detener feria y dispositivos** libera cámara y micrófono.

SUU termina una bienvenida completa por grupo. No acumula mensajes por estudiante. Si continúan entrando personas después de terminar, vuelve a saludar tras una pausa breve. Las entradas tienen prioridad sobre salidas simultáneas; los mensajes caducan mientras SUU responde preguntas. El micrófono se suspende durante la voz de SUU y vuelve a escuchar después.

La calibración guarda únicamente eje, dirección y rango geométrico en este navegador. Si se mueve la cámara, hay que enseñar ambos recorridos de nuevo. El detector descarga el modelo MediaPipe al activar la cámara y procesa los fotogramas localmente; no se guardan ni se envían rostros o grabaciones. El reconocimiento de voz conserva el funcionamiento del navegador/proveedor configurado.

La dirección se estima por movimiento de cuerpos y tamaño aparente, sin identificar personas. No se interpreta la ausencia de un rostro como una salida. Las oclusiones, grupos densos y recorridos que no se distinguen desde la cámara pueden producir errores; es necesaria una prueba en el lugar antes del uso público. No sirve como contador de asistencia. La prueba automatizada de navegador usa detecciones y audio simulados, no valida una multitud real.

El modo guía utiliza quince fichas resumidas de los afiches aportados, sin publicar los documentos originales ni identidades de estudiantes. Omite plantillas vacías y agrupa versiones repetidas. No inventa autores ni puestos; cuando se pregunta por autoría, indica que no consta en el catálogo. Las preguntas ajenas a la feria siguen permitidas. Reutiliza las voces y proveedores existentes: no requiere nuevas variables de Vercel. Requiere cámara, micrófono y reconocimiento de voz compatible (Chrome o Edge).

El botón **Pantalla completa** amplía únicamente el cuadro de visualización (rostro, encabezado y controles), sin navegación, chat ni pie de página. Escape o el mismo control permite volver.

La voz en español aplica un pequeño diccionario fonético a nombres como Innova Space Education, ScientificBrain y OpenRouter, sin modificar el chat ni los subtítulos. Los mismos ajustes se usan para la voz del navegador y la sincronización de labios. Las voces seleccionadas en inglés conservan la escritura original; estas aproximaciones no sustituyen una voz inglesa nativa para frases completas.
