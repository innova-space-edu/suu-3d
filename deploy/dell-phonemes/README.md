# SUU — Alineación fonética española (servicio opcional)

Este componente de **SUU 3D** es un servicio independiente de alineación acústica por fonemas. No forma parte de NEXORA, Synapse ni MaleCNS. No se inicia solo y no requiere cambios en los servicios activos del Dell.

## Objetivo y límites

El proveedor Edge TTS entrega tiempos **por palabra**, y ElevenLabs ofrece tiempos **por carácter**. Para obtener límites temporales acústicos de fonemas españoles puede usarse [Montreal Forced Aligner (MFA)](https://montreal-forced-aligner.readthedocs.io/). El servicio recibe el **audio sintetizado por SUU**, no grabaciones del visitante, más el texto que SUU acaba de sintetizar, y devuelve fonemas `{phone,start,end}`.

El alineador es opcional y debe instalarse con los modelos de idioma correspondientes. Su exactitud requiere pruebas auditivas y visuales con voces reales; las palabras fuera de diccionario, la pronunciación particular del TTS y el tiempo de inferencia pueden afectar la calidad. No debe presentarse como una simulación fisiológica validada.

## Preparación (entorno independiente)

Instala micromamba/conda sobre un equipo de confianza con capacidad suficiente; confirma compatibilidad de versiones de MFA y del modelo antes de desplegar:

```bash
conda create -n suu-phonemes -c conda-forge python=3.11 montreal-forced-aligner ffmpeg
conda activate suu-phonemes
pip install 'fastapi==0.115.12' 'uvicorn==0.34.2'
mfa model download dictionary spanish_mfa
mfa model download acoustic spanish_mfa
mfa model inspect dictionary spanish_mfa
mfa model inspect acoustic spanish_mfa
```

Para MFA 3.x, el flujo utilizado es `mfa align_one --output_format json AUDIO WAV TRANSCRIPT DICTIONARY ACOUSTIC OUTPUT`; comprueba `mfa align_one --help` en la versión instalada. MFA 4.x cambia la interfaz de varios comandos y requiere adaptar este servicio.

Aporta las variables únicamente mediante un archivo de entorno privado, nunca mediante Git:

```bash
export SUU_ALIGNER_TOKEN='<secreto-largo-aleatorio>'
export MFA_SPANISH_DICTIONARY='spanish_mfa'
export MFA_SPANISH_ACOUSTIC='spanish_mfa'
uvicorn service:app --app-dir deploy/dell-phonemes --host 127.0.0.1 --port 8092 --workers 1
```

**No exponer el puerto 8092 a Internet.** Para una aplicación remota, utiliza un reverse proxy HTTPS privado autenticado y limita el acceso por red y token de servicio; la cabecera `Authorization: Bearer` es obligatoria. `/healthz` sirve para comprobar preparación, no valida calidad acústica.

## Conectar con SUU

En la configuración **del servidor que ejecuta Next.js**, añade:

```dotenv
SUU_PHONEME_ALIGNER_URL=https://<servidor-privado>/align
SUU_PHONEME_ALIGNER_TOKEN=<mismo-secreto>
```

Si SUU corre en el mismo host aislado, puede usar `http://127.0.0.1:8092/align`. Sin estas variables, o si MFA no responde en 14 segundos, el sistema continúa con tiempos de caracteres, tiempos de palabras o estimaciones de duración; **no se interrumpe la voz**.

No publiques modelos, credenciales ni archivos de audio. El servidor procesa archivos temporales que se eliminan al terminar. Usa registros de acceso mínimos, límites de concurrencia y una prueba de latencia local antes de producción.

## Verificación funcional

1. Genera la voz con `POST /api/voice` enviando `timings:true`.
2. Comprueba la propiedad `sync`: `acoustically-aligned-phonemes` requiere una lista `phonemes` no vacía; `character-timed-visemes` o `word-timed-letter-estimate` son respaldos.
3. Revisa palabras como «mamá», «feria», «ciencia», «electrónica» y «Súu» escuchando el audio y observando boca, lengua, dientes y pausas.
4. Valida sincronía visual, cierres labiales /m,b,p/, apertura de vocales y ausencia de deformaciones al pausar/reanudar.
5. Haz prueba de carga y latencia con el ordenador Dell real antes de habilitarlo en modo feria.

La salida temporal de MFA es una estimación acústica condicionada por su modelo, no una observación anatómica de la boca ni una garantía de exactitud absoluta.
