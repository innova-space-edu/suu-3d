# Ensayo local del Victus Windows

Prueba acotada: mismo Qwen3-4B-Instruct-2507 Q4_K_M que respondio bien en el
Dell, con Ollama existente, y voces Piper CPU Sharvard femenina F:1 y Daniela
high femenina. No abre puertos adicionales, no conecta Tailscale ni cambia SUU,
Dell, Vercel, firewall o servicios permanentes. No requiere Git en Windows.

En PowerShell, como usuario normal, conectar el cargador y cerrar otras cargas:

```powershell
$setup = Join-Path $env:TEMP 'suu-victus-setup.ps1'
Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/innova-space-edu/suu-3d/main/deploy/victus/setup.ps1' -OutFile $setup
powershell -NoProfile -ExecutionPolicy Bypass -File $setup -InstallPython
```

La politica Bypass solo corresponde al proceso hijo, no cambia la configuracion
permanente. Abre la app Ollama antes de ejecutar. Si hay otros modelos cargados,
el ensayo se detiene; terminar su uso antes de repetir, sin detener aplicaciones
ajenas automaticamente. Si hay menos de 3 GiB de RAM libres, pide cerrar otras
aplicaciones. Requiere 7 GiB libres en disco. El alias WindowsApps de Python no
cuenta como instalacion: permite instalar Python 3.11 x64 mediante winget, y crea
un venv privado con piper-tts 1.8.0 y onnxruntime 1.23.2. Las distribuciones PyPI
publican ruedas Windows amd64 compatibles con ese interprete.

Los scripts descargados se verifican con hashes incluidos en setup. Los pesos y
configuraciones usan revisiones y SHA-256 fijos, incluyendo aproximadamente
2,50 GB del LLM y 191 MB de voces. Ollama puede almacenar otra copia importada:
reservar disco para ambas. Las dependencias ocupan espacio adicional.

Archivos en `%LOCALAPPDATA%\SUU\victus-trial`. Tres muestras por voz, fragmentos
35/80, limite 700 caracteres, contexto 2048, 96 tokens maximos por respuesta,
temperatura 0,4. Se reutilizan preguntas y simulador de continuidad del Dell.
Ollama usa cuatro hilos CPU como ajuste; determina la descarga GPU segun sus
recursos. La respuesta `/api/ps` registra `size_vram`: no se presupone descarga
completa ni se promete aceleracion antes de medir. No se cargan ambas voces a
la vez. Se calienta cada voz y se comparan mientras genera texto el LLM.

La continuidad se estima por duracion WAV y tiempo de preparacion, con un clip
anticipado. No incluye red externa ni reproduccion del navegador. Se conservan
`sharvard-sample.wav` y `daniela-sample.wav` para escuchar calidad; la preferencia
se decide escuchando, no por velocidad. No es un sintetizador nuevo: el ensayo
comprueba si Daniela high, demasiado lenta en Dell, resulta util en el Victus.

El informe contiene preguntas sinteticas, respuestas, tiempos, memoria GPU
reportada y versiones. No solicita claves privadas ni conversaciones. Al terminar
(o fallar durante las mediciones) descarga de memoria y elimina solo su alias
Ollama temporal, preservando pesos descargados, WAVs e informe para repetir.
No activa produccion ni recomienda automaticamente aumentar el modelo.

Fuentes: https://docs.ollama.com/import y https://docs.ollama.com/api/chat .
Los hashes de voces corresponden a `rhasspy/piper-voices`, revision
`5041a7a49ae5b3a0f30e6837769eb03fdbb231bd`.

Validacion: pruebas Python con red/inferencia simulada. La instalacion PowerShell,
CUDA, el rendimiento y reproduccion necesitan ejecutarse en el Victus real.

## Ollama con direccion Tailscale

El ensayo respeta `OLLAMA_HOST` tanto en PowerShell como en Python y en los
comandos Ollama de importacion/limpieza. Si falta, usa 127.0.0.1:11434.
Por ejemplo, `100.98.233.4:11434` se normaliza a HTTP y se muestra al inicio.
Solo admite loopback o direcciones Tailscale IPv4 100.64.0.0/10, sin rutas
ni credenciales. Las consultas a esa API evitan el proxy del sistema; las
descargas HTTPS conservan su configuracion de proxy. No cambia `OLLAMA_HOST`
persistente, el bind del servidor, firewall ni Tailscale.
Al actualizar, volver a descargar setup.ps1: contiene el nuevo hash del benchmark.

La comprobacion inicial usa `curl.exe --noproxy "*"`, como la consulta manual
que respondio en el Victus; informa codigo y detalle si falla, y valida el
JSON de version. `-CheckOllamaOnly` permite verificar esa conexion sin instalar
Python ni crear archivos. CI Windows prueba esta ruta con respuestas simuladas
y analiza la sintaxis del script completo. No prueba GPU ni inferencia real.

## Solo texto en Victus, Piper permanece en Dell

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File $setup -InstallPython -TextOnly
```

Volver a descargar setup antes de usar la opcion. Instala/reutiliza Python y
un venv, pero no ejecuta pip ni descarga/carga voces, ONNX Runtime o simulador
de audio. Solo descarga/verifica el GGUF 4B Q4 de 2,50 GB y el evaluador
estandar de preguntas. No elimina dependencias de ensayos anteriores.

El ensayo separado usa un minimo de 2 GiB de RAM libre, frente a 3 para el
conjunto, junto con al menos 3200 MiB de VRAM disponible. Son margenes del
ensayo, no una garantia de consumo maximo ni minima RAM universal. Cierra
otras cargas antes de ejecutarlo. Tras el calentamiento, exige que Ollama
reporte al menos 80% de `size` en `size_vram`; si no, conserva informe y se
detiene sin continuar con el benchmark para evitar asumir aceleracion GPU.

El informe imprime `loaded_models`, las 12 respuestas y `text_summary`,
incluyendo aciertos exactos y medianas. Cada respuesta registra primer texto,
primera frase de 35/60 caracteres, total, tokens/s y fin normal/truncado. No
mide Piper ni permite concluir el tiempo hasta voz en SUU. Importa bajo alias
temporal, lo elimina al terminar y deja el modelo de produccion intacto.
La conexion Victus-Dell se realizara despues de revisar rendimiento y calidad.
