"""One-time authenticated host owner action: cache the STT model on the Dell."""
from faster_whisper import WhisperModel
WhisperModel("base", device="cpu", compute_type="int8", cpu_threads=2,
             num_workers=1, download_root="/models", local_files_only=False)
print("STT base INT8 descargado y listo para modo offline")
