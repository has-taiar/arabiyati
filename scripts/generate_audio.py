#!/usr/bin/env python3
"""Generate MP3 pronunciation files for every word in js/data.js using edge-tts.
Voice: ar-IQ-RanaNeural (Iraqi Arabic, female, friendly).
Outputs to audio/{id}.mp3 — only generates missing files (idempotent).
"""

import asyncio
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
DATA_JS = ROOT / "js" / "data.js"
OUT_DIR = ROOT / "audio"
VOICE = "ar-IQ-RanaNeural"

WORD_RE = re.compile(r"\{id:(\d+),arabic:\"([^\"]+)\"")


def parse_words():
    text = DATA_JS.read_text(encoding="utf-8")
    return [(int(m.group(1)), m.group(2)) for m in WORD_RE.finditer(text)]


async def synth_one(wid: int, arabic: str, force: bool = False):
    out = OUT_DIR / f"{wid}.mp3"
    if out.exists() and not force:
        return f"skip {wid}"
    communicate = edge_tts.Communicate(arabic, VOICE, rate="-15%")
    await communicate.save(str(out))
    return f"ok   {wid} {arabic}"


async def main():
    OUT_DIR.mkdir(exist_ok=True)
    words = parse_words()
    print(f"Parsed {len(words)} words. Voice: {VOICE}")
    force = "--force" in sys.argv

    sem = asyncio.Semaphore(5)
    async def bounded(wid, ar):
        async with sem:
            try:
                msg = await synth_one(wid, ar, force=force)
                print(msg)
            except Exception as e:
                print(f"ERR  {wid} {ar}: {e}", file=sys.stderr)

    await asyncio.gather(*(bounded(wid, ar) for wid, ar in words))
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
