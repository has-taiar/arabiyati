#!/usr/bin/env python3
"""Generate MP3 pronunciation files for every word/phrase in the JS sources.
Voice: ar-IQ-RanaNeural (Iraqi Arabic, female, friendly).
Outputs to audio/{id}.mp3 — only generates missing files (idempotent).

Sources scanned:
  • js/data.js   (word list)
  • js/books.js  (book phrases, ids ≥ 1000)
"""

import asyncio
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / "js" / "data.js", ROOT / "js" / "books.js"]
OUT_DIR = ROOT / "audio"
VOICE = "ar-IQ-RanaNeural"

WORD_RE = re.compile(r"\{id:(\d+),arabic:\"([^\"]+)\"")


def parse_words():
    seen = {}
    for path in SOURCES:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for m in WORD_RE.finditer(text):
            wid = int(m.group(1))
            seen.setdefault(wid, m.group(2))  # first wins on duplicate ids
    return sorted(seen.items())


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
