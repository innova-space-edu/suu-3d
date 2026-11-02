# Micrófono y modos de SUU

El selector de modos reúne Chat, Conversación, Conversación ágil, Feria de
bienvenida y Feria de preguntas. También está disponible en la cabecera de los
modos de voz. Cambiar de modo detiene la sesión anterior; Bienvenida conserva
su narrador independiente sin micrófono ni STT.

## Micrófono externo

En Configuración → Micrófono se elige la entrada de audio. «Autorizar y probar»
abre el micrófono durante cinco segundos, muestra un medidor y comprueba nivel
bajo o picos próximos a saturación. La prueba no crea archivos, no envía audio
y no lo reproduce por los altavoces. Cerrar ajustes o detener libera el stream.
Enumerar dispositivos no solicita captura: los nombres pueden aparecer solo
después de otorgar permiso con el botón.

La entrada seleccionada y la opción de ganancia automática se conservan en este
navegador. Si el dispositivo no está disponible, elegir otro o Predeterminado.
No se reemplaza silenciosamente por otra entrada al fallar su captura.

Captura mono con cancelación de eco. Ganancia automática opcional para voz baja;
por defecto desactivada para evitar variaciones indeseadas. Se conserva la
reducción estándar limitada a auriculares y se evita aislamiento fuerte. Los
ajustes dependen del soporte del navegador y del dispositivo.

STT Dell usa la entrada seleccionada. SpeechRecognition usa la pista elegida en
Chromium de escritorio compatible; si no admite pistas, el navegador usa la
entrada predeterminada del sistema. En ese caso, seleccionar también el
micrófono correcto en Windows. La prueba de nivel no garantiza la exactitud del
reconocimiento ni mide por sí sola la calidad perceptual.

## Conversación ágil

- STT Dell finaliza después de 600 ms de silencio detectado, frente a 1150 ms
  en Conversación normal. Un único pico no se considera voz.
- Pide una o dos frases y máximo 30 palabras, con presupuesto de 64 tokens.
  Es una instrucción y un límite de generación, no una garantía exacta de
  palabras ni de respuestas completas en todos los modelos.
- Reanuda la escucha a los 120 ms de terminar, frente a 250 ms normal.
- Conserva el streaming Qwen → Piper para comenzar a hablar antes de completar
  la respuesta cuando se usa Piper. Otros motores conservan su reproducción
  habitual. No acelera físicamente el modelo, la red ni la síntesis.
- Si se usa reconocimiento del navegador como respaldo, su final de frase lo
  decide el navegador; no se promete la pausa de 600 ms en ese recorrido.

Las conversaciones siguen sin guardar las grabaciones del micrófono. La voz
capturada para transcribir se envía al endpoint protegido de STT, como antes.

## Comprobación en el equipo

1. Abrir Configuración; seleccionar el micrófono externo y probar hablando a
   distancia normal. Bajar ganancia si satura; probar ganancia automática si es
   muy bajo. Repetir y comprobar transcripción.
2. Elegir Conversación ágil, iniciar el micrófono y preguntar algo breve.
3. Comparar con Conversación usando la misma pregunta, voz y servidor.
4. Cambiar de modo durante escucha/reproducción y comprobar que se detiene.
5. Abrir Feria → Bienvenida: no debe solicitar ni activar el micrófono.

Las pruebas automatizadas verifican opciones de captura, cancelación, endpoint
por silencio, envío del perfil breve y límites del proveedor. La latencia total,
el nivel real y los permisos requieren comprobación en el dispositivo.
