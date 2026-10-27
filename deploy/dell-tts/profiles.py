"""Allowlisted voice profiles and benchmark decisions. Host-side; no secrets printed."""
import json
import math
import sys
from pathlib import Path

PROFILES = {
    "daniela": ("es_AR-daniela-high", "0"),
    "sharvard": ("es_ES-sharvard-medium", "1"),
}


def recommended(rows):
    def score(voice):
        matches = [row["median_rtf"] for row in rows
                   if row.get("voice") == voice and row.get("threads") == 1]
        if len(matches) != 1 or not isinstance(matches[0], (int, float)):
            raise ValueError("Missing or duplicate benchmark summary")
        value = matches[0]
        if not math.isfinite(value) or value <= 0:
            raise ValueError("Invalid benchmark measurement")
        return value
    baseline = score(PROFILES["daniela"][0])
    candidate = score(PROFILES["sharvard"][0])
    return "sharvard" if candidate < 1 and candidate <= baseline * .85 else "keep"


def update_env(text, profile, threads):
    if profile not in PROFILES or threads not in (1, 2):
        raise ValueError("Invalid profile or CPU count")
    model, speaker = PROFILES[profile]
    values = {"PIPER_MODEL_NAME": model, "PIPER_SPEAKER_ID": speaker,
              "PIPER_THREADS": str(threads), "TTS_CPUS": str(threads)}
    lines = [line for line in text.splitlines() if line.split("=", 1)[0].strip() not in values]
    return "\n".join(lines + [f"{key}={value}" for key, value in values.items()]) + "\n"


if __name__ == "__main__":
    if sys.argv[1] == "recommend":
        rows = [json.loads(line) for line in Path(sys.argv[2]).read_text().splitlines() if line.strip()]
        print(recommended(rows))
    elif sys.argv[1] == "set":
        path = Path(sys.argv[2])
        if path.is_symlink() or not path.is_file():
            raise ValueError("Invalid environment file")
        path.write_text(update_env(path.read_text(), sys.argv[3], int(sys.argv[4])))
    else:
        raise ValueError("Invalid operation")
