# Bienvenida de feria grabada

Bienvenida usa un narrador independiente de la conversación normal. No monta
reconocimiento, STT ni captura de micrófono. Solo solicita cámara (`audio:false`)
para distinguir los recorridos de entrada y salida ya configurados.

El panel muestra el último trayecto reconocido y el estado del audio. La feria
solo se activa cuando la cámara, la calibración y la grabación están listas,
y el sonido no está silenciado.

Una entrada activa la bienvenida completa y un resumen de los 15 trabajos del
catálogo, sin usar un LLM. Fuentes: catálogo revisado en `lib/fair-guide.ts` y
los guiones proporcionados en `Podcasts_SUU_Expo_Ciencias_2026(1).zip`, incluido
su `catalogo_suu_podcast.json`. Se omiten identidades de estudiantes y resultados
no medidos. Los trabajos de telescopios se presentan conjuntamente.

Las salidas se siguen detectando: suprimen una entrada pendiente, pero nunca
producen voz. Si se detectan entrada y salida simultáneas, prevalece la entrada.
Una narración iniciada termina antes de aceptar otra; no acumula una cola de
visitantes. La comprobación sin voz sigue siendo opcional.

Al salir del diálogo de configuración se prepara toda la narración, en serie,
con fragmentos de hasta 600 caracteres. No se usa el divisor conversacional
limitado a 700 caracteres totales. Cada fragmento conserva su texto para animar
la boca con el reloj del audio; no es alineación fonética real.

El audio se guarda automáticamente en Cache Storage del mismo navegador y origen,
con clave SHA-256 del guion completo, voz, idioma y versión de caché. Reabrir
con la misma voz/guion reutiliza los fragmentos sin síntesis. Una generación
interrumpida puede continuar con los fragmentos ya guardados. No se guardan
preguntas de visitantes, imágenes de cámara, claves ni respuestas del chat.
Máximo: 3 MB por fragmento y 48 MB por grabación en memoria. Al completar una
versión se eliminan las anteriores. No se publica un archivo de audio en Vercel
ni se copia al disco del Dell.

Si el navegador no permite persistir, se informa que el audio solo permanece en
memoria. Borrar datos del navegador o usar otro equipo requiere generarlo de
nuevo. No es una garantía de funcionamiento offline de toda la aplicación.

Piper Dell se usa para la voz Piper o «preferida» cuando está configurado. Una
voz EDUAI seleccionada usa `/api/voice` durante la preparación inicial. La opción Automática conserva su respaldo EDUAI cuando Piper no está
configurado. Una voz explícita no cambia de proveedor por un fallo de síntesis. Las voces SpeechSynthesis del navegador no
permiten exportar audio: se explica que debe elegirse Piper o EDUAI.

Si se cambia el modelo/hablante Piper en el Dell sin cambiar su ID web, pulsar
**Regenerar audio**. La clave del navegador no conoce esa modificación externa.
Preparar/reintentar reutiliza fragmentos válidos; Regenerar borra la grabación.
La síntesis tiene límite de 55 segundos por fragmento. Detener/cerrar cancela la
reproducción y libera URLs temporales; cerrar también cancela la preparación.

## Prueba en el equipo de la feria

1. Elegir Piper Dell y abrir Feria → Bienvenida.
2. Reutilizar los recorridos o enseñar otros. Esperar «Bienvenida completa
   guardada»; no debe aparecer ninguna solicitud de permiso de micrófono.
3. Activar la feria y probar la bienvenida grabada para comprobar el sonido.
4. Hacer una entrada: debe leer desde el saludo hasta el cierre con todos los
   resúmenes. Verificar la boca y el volumen. Salir no debe iniciar otra voz.
5. Hacer otra entrada tras terminar: Network no debe mostrar nueva síntesis.
6. Recargar, reutilizar la misma configuración y repetir. Debe recuperar el
   audio. Probar detener durante la narración.

Las pruebas automatizadas verifican caché, cancelación, integridad del texto y
el arbitraje entrada/salida. No sustituyen una prueba real de cámara, volumen,
pronunciación y permisos de reproducción del navegador.

El seguimiento adapta su historial a la frecuencia real del detector (hasta
cuatro segundos). Detecta recorridos sostenidos con tres muestras incluso a
650–1300 ms entre muestras. Para cruces breves de solo dos muestras exige un
desplazamiento mayor, para no confundir pequeñas oscilaciones con una entrada.
Esto no garantiza detectar todos los cruces ni sustituye la prueba con cámara.
