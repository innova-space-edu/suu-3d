# Cambio de modelo local: Qwen3-4B-Instruct-2507 Q5_K_M

El candidato usa el modelo **Instruct, no Thinking**, en GGUF Q5_K_M (~2,89 GB).
Archivo del cuantizador bartowski, revisión y SHA-256 fijados en el script:

- Fuente: https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF
- Modelo original: https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507
- SHA-256: `66713ce35a58a82fe87642d4ec13425bf9b9a46800fff5c49a665ef5701439dc`

## Prueba en el Dell

Ejecutar como propietario (sin `sudo` delante de Python), desde el repositorio
actualizado. Docker puede solicitar la contraseña sudo existente. Cerrar las
conversaciones activas de SUU durante las mediciones.

```bash
python3 deploy/dell-ai/admin/trial-model.py
python3 deploy/dell-ai/admin/trial-model.py --apply
```

Sin `--apply` solo muestra los recursos y el plan. La prueba con `--apply`:

1. Comprueba como mínimo 7 GiB de memoria disponible: 5 GiB de límite para el
   candidato y 2 GiB de margen. Esto es un criterio conservador del ensayo,
   no una medición de consumo ni la RAM mínima universal del modelo.
2. Descarga solo el GGUF fijado y verifica tamaño exacto/SHA-256. Conserva el
   modelo anterior y no cambia el servicio público.
3. Evalúa las mismas 12 preguntas sintéticas en el modelo actual y el candidato,
   usando en ambos el muestreo actual de SUU (`temperature=0.4`) para que la
   comparación corresponda a producción. La API no cambia sus parámetros.
4. Ejecuta el candidato temporalmente en `127.0.0.1:8097`, con dos CPU, 5 GiB,
   la misma imagen llama.cpp ya instalada, raíz/modelos/clave de solo lectura,
   sin privilegios ni acceso al socket Docker desde el contenedor.
5. Mide una respuesta del candidato mientras Piper sintetiza su primer
   fragmento. `first_audio_ready_seconds` indica WAV disponible en el Dell,
   **no** voz ya reproducida en el navegador. No incluye Vercel/Cloudflare.
6. Guarda el informe privado `~/suu-ai/model-trial-*.json` y elimina el contenedor
   temporal al finalizar o fallar. Conserva el GGUF descargado para activarlo
   después. El servicio original sigue en el puerto 8094.

La coincidencia exacta también mide formato. Se normalizan subíndices Unicode
(por ejemplo H₂O); las explicaciones abiertas siguen requiriendo revisión humana.
Un resultado alto en estas pocas preguntas no garantiza conocimiento general.
No se registra la clave ni se leen conversaciones personales.

## Activación y reversión

Después de revisar el informe, usar la orden de activación exacta que imprime el
script. Requiere al menos 9/10 coincidencias, superar al modelo actual, ausencia
de OOM, prueba conjunta con Piper correcta (RTF menor que 1) y respuesta dentro
de 45 segundos y primer audio listo en un máximo de 8 segundos. Son filtros mínimos, no una validación educativa completa.

La activación respalda `.env` y `compose.yaml`, selecciona el GGUF con límite
5 GiB y fija la imagen por el digest probado. Conserva las CPU/hilos del informe ensayado, contexto 2048,
alias `suu-local`, clave, puerto 8094 y rutas existentes. Solo reinicia `suu-llm`.
Si no arranca o falla la prueba de inferencia, restaura los archivos anteriores.
Imprime el comando de reversión con la carpeta de respaldo exacta.

```bash
# Sustituir INFORME por la ruta real que imprimió la prueba:
python3 deploy/dell-ai/admin/trial-model.py --activate INFORME --apply
# Si fuera necesario, usar la ruta de respaldo real que imprimió la activación:
python3 deploy/dell-ai/admin/trial-model.py --rollback RESPALDO --apply
```

No reemplazar los archivos a mano ni ejecutar el bootstrap inicial para cambiar
el modelo. Un Compose personalizado se rechaza en lugar de sobrescribirse.
Piper, STT, intranet, base de datos y Cloudflare mantienen su configuración.

## Compatibilidad del tiempo de respuesta

SUU conserva la espera inicial de hasta 22 segundos para el Dell. En streaming,
cuando recibe texto, renueva un límite de inactividad de hasta 12 segundos, con
un máximo total de 48 segundos por intento del Dell y respetando el presupuesto
global de la API. Así un modelo mayor que avanza no se corta a los 22 segundos.
Las respuestas JSON y los demás proveedores conservan sus límites anteriores.

El benchmark también permite `--preset qwen3-instruct` para explorar los ajustes
publicados de Qwen (0,7 / top-p 0,8 / top-k 20 / min-p 0). Esa opción no los
activa en SUU. El ensayo de sustitución usa el preset actual, por coherencia.

## Ajuste de CPU sin activar producción

```bash
python3 deploy/dell-ai/admin/trial-model.py --tune --apply
```

Reutiliza el GGUF Q5 verificado; no lo descarga de nuevo si ya está presente.
Detecta núcleos físicos mediante pares socket/core de `/proc/cpuinfo`, sin contar
hilos SMT como núcleos adicionales. Compara secuencialmente CPU 2/4/6 hasta
el número de núcleos físicos menos dos, conservando el perfil de dos CPU como
referencia. Con topología desconocida solo prueba dos CPU. No fija afinidad
ni garantiza núcleos exclusivos: los límites Docker son cuotas de tiempo CPU.

Cada perfil se calienta antes de medir, repite las doce preguntas y ejecuta
tres pruebas Qwen + Piper. El informe conserva todas las muestras y usa el
peor tiempo hasta WAV listo, tiempo total y RTF. Este audio se mide localmente;
no incluye la red externa ni reproducción. Las pruebas pueden tardar varios
minutos por perfil; evitar conversaciones y otros trabajos intensivos durante
la comparación. El modelo de producción permanece encendido e intacto.

Activación: además de los controles previos, exige primer WAV listo ≤8 s,
texto completo ≤45 s y RTF <1. Ocho segundos es un techo inicial, no una meta
de buena conversación. Los informes antiguos con voz a 14 s ya no pasan.
La activación copia la cantidad de CPU/hilos ensayada al perfil; por defecto
Compose sigue con dos CPU. No hay selección ni activación automática.

El puerto del candidato es ahora 8097: 8095 pertenece a `suu-stt`. Un puerto
ocupado da un mensaje explícito sin detener al servicio que lo utiliza.
La coincidencia exacta sigue midiendo formato; revisar manualmente los
desarrollos matemáticos correctos y las respuestas abiertas.

## Candidato intermedio para Dell de dos núcleos: Qwen3.5-2B Q5

```bash
python3 deploy/dell-ai/admin/trial-model.py --model qwen-2b --apply
```

Descarga 1.568.476.256 bytes desde `bartowski/Qwen_Qwen3.5-2B-GGUF`,
revisión `7d26695454df6de5fbcce2e58681e62dae06ce43`, archivo remoto
`Qwen_Qwen3.5-2B-Q5_K_M.gguf`. SHA-256:
`3f50d5f830873c22d33558f69eb2c34aa59858f37e7a58a982aae88bb38ebe88`.
Se conserva como `~/suu-ai/models/Qwen3.5-2B-Q5_K_M.gguf`.
Modelo original: https://huggingface.co/Qwen/Qwen3.5-2B
Cuantización: https://huggingface.co/bartowski/Qwen_Qwen3.5-2B-GGUF

Mantiene dos CPU, memoria limitada a 5 GiB y mínimo disponible de 7 GiB,
puerto de ensayo 8097, razonamiento desactivado, temperatura 0,4, las mismas
doce preguntas, calentamiento y tres muestras de voz. Así la comparación
con 4B no cambia simultáneamente prompt, presupuesto o muestreo. El archivo
menor no garantiza más velocidad ni suficiente calidad: debe medirse.

El informe contiene `model_profile` y el resumen imprime modelo, CPU/hilos
y peor tiempo hasta primer audio. La activación lee ese perfil del informe y
verifica su SHA; un informe 4B no autoriza pesos 2B ni viceversa. Informes
antiguos sin perfil se interpretan como 4B. Por defecto, sin `--model`, sigue
probando el 4B anterior. No activa ni selecciona un modelo automáticamente;
permanece la revisión de respuestas abiertas, calidad y demora local.

## Último ensayo local: mismo 4B en Q4_K_M

```bash
python3 deploy/dell-ai/admin/trial-model.py --model qwen-4b-q4 --apply
```

Usa Qwen3-4B-Instruct-2507 de la misma revisión del cuantizador que Q5,
`ae44f08e1392f39c0e474af10c3ff8355c8b6688`. Solo cambia la cuantización:
archivo remoto `Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, tamaño exacto
2.497.280.736 bytes, SHA-256
`2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e`.
Los archivos Q5 y los modelos anteriores se conservan. No se garantiza
velocidad ni calidad; se miden con los mismos límites y preguntas,
calentamiento y tres muestras de voz. No cambia la fragmentación ni el prompt
de producción durante esta comparación.

Al terminar, el script comparte la validación de calidad/latencia con la
activación real. Si falla, imprime el motivo y NO muestra un comando de
activación. Si pasa, muestra el comando para revisión; todavía verifica
pesos, imagen, recursos y configuración antes de cualquier cambio real.
También rechaza métricas ausentes o no finitas.
