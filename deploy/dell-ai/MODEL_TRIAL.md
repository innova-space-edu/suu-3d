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
4. Ejecuta el candidato temporalmente en `127.0.0.1:8095`, con dos CPU, 5 GiB,
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
de 45 segundos. Son filtros mínimos, no una validación educativa completa.

La activación respalda `.env` y `compose.yaml`, selecciona el GGUF con límite
5 GiB y fija la imagen por el digest probado. Mantiene dos CPU, contexto 2048,
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
