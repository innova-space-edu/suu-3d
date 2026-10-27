"""Local voice pipeline measurement, with one clip prefetched as in SUU.
No device playback: gaps are estimates using WAV durations and wall-clock readiness.
"""
from concurrent.futures import ThreadPoolExecutor
import math
import queue
import re
import time


class SpeechBuffer:
    def __init__(self, output, first=60, following=150):
        self.output, self.first, self.following = output, first, following
        self.pending, self.received, self.part = "", 0, 0

    def add(self, delta):
        take = delta[:max(0, 700 - self.received)]
        self.received += len(take)
        self.pending += take
        self.drain(self.received >= 700)

    def finish(self):
        self.drain(True)

    def drain(self, final):
        while self.pending.strip():
            limit = self.first if self.part == 0 else self.following
            front, cut = self.pending[:limit + 1], 0
            for match in re.finditer(r"[.!?;:](?=\s)", front):
                if match.end() >= 20:
                    cut = match.end()
                    break
            if not cut and len(self.pending) > limit:
                cut = front.rfind(" ")
                if cut < limit * .55:
                    cut = limit
            if not cut:
                if not final:
                    return
                cut = len(self.pending)
            phrase = self.pending[:cut].strip()
            self.pending = self.pending[cut:].lstrip()
            if phrase:
                self.output(phrase)
                self.part += 1


def schedule(previous_end, ready, duration):
    start = max(previous_end, ready)
    return start, start + duration, max(0, ready - previous_end)


def measure(completion, synthesize, first=60, following=150, clock=time.perf_counter, sleep=time.sleep):
    started, phrases, clips = clock(), queue.Queue(), []
    buffer = SpeechBuffer(phrases.put, first, following)

    def consume():
        previous_end, previous_start = 0, 0
        while True:
            phrase = phrases.get()
            if phrase is None:
                return
            # Start preparing clip i only when clip i-1 starts playing.
            # This bounds synthesis to one clip ahead, as in piper-playback.ts.
            delay = previous_start - (clock() - started)
            if delay > 0:
                sleep(delay)
            synthesis_start = clock()
            duration = synthesize(phrase)
            if not math.isfinite(duration) or duration <= 0:
                raise ValueError("Duración WAV inválida")
            ready = clock() - started
            start, end, gap = schedule(previous_end, ready, duration)
            clips.append({"characters": len(phrase), "ready_seconds": round(ready, 3),
                          "audio_seconds": round(duration, 3), "play_start_estimated_seconds": round(start, 3),
                          "gap_estimated_seconds": round(gap if clips else 0, 3),
                          "piper_rtf": round((clock() - synthesis_start) / duration, 3)})
            previous_start, previous_end = start, end

    with ThreadPoolExecutor(max_workers=1) as pool:
        worker = pool.submit(consume)
        try:
            result = completion(buffer.add)
            buffer.finish()
        finally:
            phrases.put(None)
        worker.result()
    if not clips:
        raise ValueError("No se generaron fragmentos")
    gaps = [row["gap_estimated_seconds"] for row in clips[1:]]
    return {"first_limit": first, "following_limit": following, "clips": clips,
            "first_audio_ready_seconds": clips[0]["ready_seconds"],
            "model_total_seconds": result["total_seconds"], "piper_rtf": max(row["piper_rtf"] for row in clips),
            "max_gap_estimated_seconds": max(gaps, default=0),
            "total_gaps_estimated_seconds": round(sum(gaps), 3),
            "note": "WAV local y continuidad estimada, sin red externa ni reproducción real"}
