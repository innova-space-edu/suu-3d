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
