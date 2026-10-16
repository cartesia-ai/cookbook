import json
import os
from typing import Dict, List

WORDS_PER_CUE = 8
_SENTENCE_END = (".", "!", "?", "\u2026")

def sidecar_paths(audio_file: str) -> Dict[str, str]:
    base, _ = os.path.splitext(audio_file)
    return {"json": base + ".timings.json", "vtt": base + ".vtt"}

def vtt_time(seconds: float) -> str:
    ms = int(round(max(seconds, 0) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

def group_cues(words: List[dict], words_per_cue: int = WORDS_PER_CUE) -> List[dict]:
    cues, current = [], []
    for word in words:
        current.append(word)
        if len(current) >= words_per_cue or word["w"].rstrip("\u201d\"'\u2019)").endswith(_SENTENCE_END):
            cues.append(current)
            current = []
    if current:
        cues.append(current)
    return [
        {
            "start": group[0]["s"],
            "end": max(group[-1]["e"], group[0]["s"] + 0.05),
            "text": " ".join(w["w"] for w in group),
        }
        for group in cues
    ]

def render_vtt(words: List[dict]) -> str:
    lines = ["WEBVTT", ""]
    for cue in group_cues(words):
        lines.append(f"{vtt_time(cue['start'])} --> {vtt_time(cue['end'])}")
        lines.append(cue["text"])
        lines.append("")
    return "\n".join(lines)

def build_timings(chapter: int, title: str, model: str, sample_rate: int, duration: float, words: List[dict]) -> dict:
    return {
        "chapter": chapter,
        "title": title,
        "model": model,
        "sample_rate": sample_rate,
        "duration": round(duration, 3),
        "words": words,
    }

def write_sidecars(audio_file: str, timings: dict) -> Dict[str, str]:
    paths = sidecar_paths(audio_file)
    with open(paths["json"], "w", encoding="utf-8") as f:
        json.dump(timings, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(paths["vtt"], "w", encoding="utf-8") as f:
        f.write(render_vtt(timings["words"]))
    return paths
