#!/usr/bin/env python3
"""Generate MP3 pronunciation files for every word/phrase in the JS sources.

Voice: ar-IQ-RanaNeural (Iraqi Arabic, female, friendly).
Outputs to audio/{id}.mp3.

Sources scanned:
  • js/data.js   (word list)
  • js/books.js  (book phrases, ids ≥ 1000)

A manifest at audio/manifest.json tracks (id → text + sha256 + voice + rate)
so that:
  • If a source phrase's Arabic text changes, the audio is automatically
    regenerated on the next run. (Previously, stale audio survived
    silently because the script only checked file existence.)
  • If the voice or rate changes, all entries are regenerated.
  • Missing files are regenerated.

Usage:
  python scripts/generate_audio.py            # generate missing/stale only
  python scripts/generate_audio.py --force    # regenerate every entry
  python scripts/generate_audio.py --check    # exit non-zero if anything stale
"""

import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / "js" / "data.js", ROOT / "js" / "books.js"]
OUT_DIR = ROOT / "audio"
MANIFEST = OUT_DIR / "manifest.json"
VOICE = "ar-IQ-RanaNeural"
RATE = "-15%"

WORD_RE = re.compile(r"\{id:(\d+),arabic:\"([^\"]+)\"")


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


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


def load_manifest():
    if not MANIFEST.exists():
        return {}
    try:
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_manifest(manifest):
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def needs_regen(wid, arabic, manifest, force):
    """Return reason string if audio for this id needs to be regenerated, else None."""
    out = OUT_DIR / f"{wid}.mp3"
    entry = manifest.get(str(wid))
    if force:
        return "force"
    if not out.exists():
        return "missing"
    if not entry:
        return "no-manifest-entry"
    if entry.get("hash") != text_hash(arabic):
        return "text-changed"
    if entry.get("voice") != VOICE or entry.get("rate") != RATE:
        return "voice-or-rate-changed"
    return None


async def synth_one(wid, arabic):
    out = OUT_DIR / f"{wid}.mp3"
    communicate = edge_tts.Communicate(arabic, VOICE, rate=RATE)
    await communicate.save(str(out))


async def main():
    OUT_DIR.mkdir(exist_ok=True)
    words = parse_words()
    force = "--force" in sys.argv
    check_only = "--check" in sys.argv

    manifest = load_manifest()
    print(f"Parsed {len(words)} entries. Voice: {VOICE} rate: {RATE}")

    todo = []
    fresh = 0
    for wid, ar in words:
        reason = needs_regen(wid, ar, manifest, force)
        if reason:
            todo.append((wid, ar, reason))
        else:
            fresh += 1

    print(f"Fresh: {fresh}  Stale/missing: {len(todo)}")
    if check_only:
        if todo:
            for wid, ar, reason in todo:
                print(f"STALE {wid} [{reason}] {ar}")
            sys.exit(2)
        print("All audio is up to date.")
        return

    if not todo:
        print("Nothing to do.")
        return

    sem = asyncio.Semaphore(5)

    async def bounded(wid, ar, reason):
        async with sem:
            try:
                await synth_one(wid, ar)
                manifest[str(wid)] = {
                    "text": ar,
                    "hash": text_hash(ar),
                    "voice": VOICE,
                    "rate": RATE,
                }
                print(f"ok   {wid} [{reason}] {ar}")
            except Exception as e:
                print(f"ERR  {wid} {ar}: {e}", file=sys.stderr)

    await asyncio.gather(*(bounded(wid, ar, reason) for wid, ar, reason in todo))

    # Drop stale manifest entries for ids that no longer exist in sources.
    valid_ids = {str(wid) for wid, _ in words}
    for old_id in list(manifest.keys()):
        if old_id not in valid_ids:
            del manifest[old_id]

    save_manifest(manifest)
    print(f"Done. Manifest written to {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    asyncio.run(main())
