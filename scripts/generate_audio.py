#!/usr/bin/env python3
"""Generate MP3 pronunciation files for every word/phrase in the JS sources.

Multi-voice, multi-backend audio generator.

Voices:
  rana   → ar-IQ-RanaNeural   (female, Iraqi)
  bassel → ar-IQ-BasselNeural (male, Iraqi)

Backends:
  edge   → edge-tts (free, no auth)
  azure  → Azure Speech REST (uses AZURE_SPEECH_KEY + AZURE_SPEECH_REGION,
           supports SSML <phoneme> overrides from audio/lexicon.json,
           and optional CAMeL-Tools MLE diacritization)

Output layout:
  audio/{voice}/{id}.mp3        e.g. audio/rana/12.mp3, audio/bassel/12.mp3

Manifest: audio/manifest.json  (schema v2)
  {
    "rana":   { "<id>": { "text", "hash", "edge_voice", "rate",
                          "backend", "diacritized", "lexicon_hash" } },
    "bassel": { ... }
  }

A row is regenerated when:
  • the file is missing
  • the source Arabic text changed (sha256 prefix mismatch)
  • the recorded voice/rate/backend/diacritized/lexicon_hash no longer matches
    the active configuration

Usage:
  python scripts/generate_audio.py                      # rana via edge-tts (default)
  python scripts/generate_audio.py --voice bassel       # bassel via edge-tts
  python scripts/generate_audio.py --voice all          # both voices
  python scripts/generate_audio.py --backend azure      # use Azure Speech REST
  python scripts/generate_audio.py --diacritize         # Azure only: CAMeL MLE
  python scripts/generate_audio.py --force              # regen all
  python scripts/generate_audio.py --check              # exit 2 if anything stale
  python scripts/generate_audio.py --limit 5            # only first N stale entries
  python scripts/generate_audio.py --ids 1,2,3          # restrict to specific ids
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / "js" / "data.js", ROOT / "js" / "books.js"]
OUT_DIR = ROOT / "audio"
MANIFEST = OUT_DIR / "manifest.json"
LEXICON_PATH = OUT_DIR / "lexicon.json"

VOICES = {
    "rana":   "ar-IQ-RanaNeural",
    "bassel": "ar-IQ-BasselNeural",
}
RATE = "-15%"

# Map our short voice keys → Azure neural voice names (same as edge-tts here).
AZURE_VOICE = dict(VOICES)

WORD_RE = re.compile(r"\{id:(\d+),arabic:\"([^\"]+)\"")


# ── Source parsing ────────────────────────────────────────────────────────────
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


# ── Manifest I/O ──────────────────────────────────────────────────────────────
def load_manifest():
    if not MANIFEST.exists():
        return {v: {} for v in VOICES}
    try:
        m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except Exception:
        return {v: {} for v in VOICES}
    # Tolerate either v2 already, or legacy flat shape.
    if any(k in VOICES for k in m.keys()):
        for v in VOICES:
            m.setdefault(v, {})
        return m
    # Legacy flat → migrate to rana
    migrated = {v: {} for v in VOICES}
    for k, v in m.items():
        migrated["rana"][k] = {
            "text": v.get("text", ""),
            "hash": v.get("hash", ""),
            "edge_voice": v.get("voice", VOICES["rana"]),
            "rate": v.get("rate", RATE),
            "backend": "edge",
            "diacritized": False,
            "lexicon_hash": None,
        }
    return migrated


def save_manifest(manifest):
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


# ── Lexicon (Arabic → IPA overrides for SSML <phoneme>) ───────────────────────
def load_lexicon():
    if not LEXICON_PATH.exists():
        return {}, ""
    try:
        data = json.loads(LEXICON_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}, ""
    entries = data.get("entries", {})
    raw = json.dumps(entries, ensure_ascii=False, sort_keys=True)
    return entries, hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def apply_lexicon_ssml(text, lexicon):
    """Replace each lexicon-keyed Arabic word with an SSML <phoneme> tag.
    Greedy by descending key length so longer matches win.
    """
    if not lexicon:
        return text
    keys = sorted(lexicon.keys(), key=len, reverse=True)
    out = text
    for k in keys:
        ipa = lexicon[k].get("ipa")
        if not ipa:
            continue
        # XML-escape the IPA & arabic for safety
        ipa_esc = (
            ipa.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;")
        )
        replacement = f'<phoneme alphabet="ipa" ph="{ipa_esc}">{k}</phoneme>'
        out = out.replace(k, replacement)
    return out


# ── Optional: Mishkal diacritizer (lazy-loaded, pure Python) ──────────────────
_diacritizer = None


def diacritize(text):
    """Add tashkeel to MSA-ish Arabic text using Mishkal.
    Returns text unchanged on failure. Mishkal is rule-based and pure Python.
    """
    global _diacritizer
    if _diacritizer is None:
        try:
            from mishkal import tashkeel  # type: ignore
            _diacritizer = tashkeel.TashkeelClass()
        except Exception as e:
            print(f"[diacritize] disabled: {e}", file=sys.stderr)
            _diacritizer = False
    if not _diacritizer:
        return text
    try:
        return _diacritizer.tashkeel(text)
    except Exception as e:
        print(f"[diacritize] error: {e}", file=sys.stderr)
        return text


# ── Synthesis backends ────────────────────────────────────────────────────────
async def synth_edge(text, voice_full, out_path, rate):
    communicate = edge_tts.Communicate(text, voice_full, rate=rate)
    await communicate.save(str(out_path))


_azure_token = None
_azure_token_lock = asyncio.Lock()


async def _azure_token_get(region, key):
    """Issue or reuse a 10-minute Azure Speech bearer token."""
    global _azure_token
    import aiohttp
    async with _azure_token_lock:
        if _azure_token:
            return _azure_token
        url = f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
        async with aiohttp.ClientSession() as s:
            async with s.post(url, headers={"Ocp-Apim-Subscription-Key": key}) as r:
                r.raise_for_status()
                _azure_token = await r.text()
        return _azure_token


def _ssml(voice_full, body, rate):
    # rate "-15%" → prosody rate
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xml:lang="ar-IQ">'
        f'<voice name="{voice_full}">'
        f'<prosody rate="{rate}">{body}</prosody>'
        f'</voice></speak>'
    )


async def synth_azure(text, voice_full, out_path, rate, region, key, lexicon):
    import aiohttp
    body = apply_lexicon_ssml(text, lexicon)
    ssml = _ssml(voice_full, body, rate)
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    # F0 free tier: 20 transactions per 60s window for neural voices.
    # Retry with exponential backoff on 429.
    delays = [4, 8, 16, 32, 60]
    last_err = None
    for attempt in range(len(delays) + 1):
        token = await _azure_token_get(region, key)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "huroof-audio-gen",
        }
        async with aiohttp.ClientSession() as s:
            async with s.post(url, data=ssml.encode("utf-8"), headers=headers) as r:
                if r.status == 200:
                    out_path.write_bytes(await r.read())
                    return
                detail = (await r.text())[:300]
                last_err = f"Azure TTS {r.status}: {detail}"
                if r.status == 429 and attempt < len(delays):
                    await asyncio.sleep(delays[attempt])
                    continue
                raise RuntimeError(last_err)
    raise RuntimeError(last_err or "Azure TTS unknown error")


# ── Staleness check ───────────────────────────────────────────────────────────
def needs_regen(voice_key, wid, arabic, manifest, force, backend, diacritized,
                lexicon_hash, rate):
    out = OUT_DIR / voice_key / f"{wid}.mp3"
    entry = manifest.get(voice_key, {}).get(str(wid))
    if force:
        return "force"
    if not out.exists():
        return "missing"
    if not entry:
        return "no-manifest-entry"
    if entry.get("hash") != text_hash(arabic):
        return "text-changed"
    if entry.get("edge_voice") != VOICES[voice_key]:
        return "voice-changed"
    if entry.get("rate") != rate:
        return "rate-changed"
    if entry.get("backend") != backend:
        return "backend-changed"
    if backend == "azure":
        if bool(entry.get("diacritized")) != bool(diacritized):
            return "diacritized-changed"
        if entry.get("lexicon_hash") != lexicon_hash:
            return "lexicon-changed"
    return None


# ── Main ──────────────────────────────────────────────────────────────────────
async def run(args):
    OUT_DIR.mkdir(exist_ok=True)
    for v in VOICES:
        (OUT_DIR / v).mkdir(exist_ok=True)

    if args.voice == "all":
        voice_keys = list(VOICES.keys())
    else:
        voice_keys = [args.voice]

    backend = args.backend
    rate = args.rate or RATE

    azure_key = os.environ.get("AZURE_SPEECH_KEY")
    azure_region = os.environ.get("AZURE_SPEECH_REGION")
    if backend == "azure" and (not azure_key or not azure_region):
        # Try to read from .env
        env = ROOT / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())
            azure_key = os.environ.get("AZURE_SPEECH_KEY")
            azure_region = os.environ.get("AZURE_SPEECH_REGION")
        if not azure_key or not azure_region:
            print("ERROR: --backend azure requires AZURE_SPEECH_KEY and "
                  "AZURE_SPEECH_REGION (set in .env or env vars).", file=sys.stderr)
            sys.exit(1)

    lexicon, lexicon_hash = ({}, "")
    if backend == "azure":
        lexicon, lexicon_hash = load_lexicon()

    words = parse_words()
    if args.ids:
        wanted = {int(x) for x in args.ids.split(",") if x.strip()}
        words = [(i, t) for i, t in words if i in wanted]

    manifest = load_manifest()

    print(f"Voices: {voice_keys}  Backend: {backend}  Rate: {rate}  "
          f"Diacritize: {args.diacritize}  Words: {len(words)}")

    # Build todo across selected voices
    todo = []  # (voice_key, wid, arabic, reason)
    fresh = 0
    for voice_key in voice_keys:
        for wid, ar in words:
            reason = needs_regen(voice_key, wid, ar, manifest, args.force,
                                 backend, args.diacritize, lexicon_hash, rate)
            if reason:
                todo.append((voice_key, wid, ar, reason))
            else:
                fresh += 1

    print(f"Fresh: {fresh}  Stale/missing: {len(todo)}")

    if args.check:
        if todo:
            for vk, wid, ar, reason in todo[:30]:
                print(f"STALE {vk}/{wid} [{reason}] {ar}")
            if len(todo) > 30:
                print(f"... and {len(todo) - 30} more")
            sys.exit(2)
        print("All audio is up to date.")
        return

    if args.limit:
        todo = todo[: args.limit]
        print(f"Limited to first {len(todo)} entries.")

    if not todo:
        print("Nothing to do.")
        return

    sem = asyncio.Semaphore(args.concurrency)

    async def bounded(voice_key, wid, ar, reason):
        async with sem:
            out = OUT_DIR / voice_key / f"{wid}.mp3"
            voice_full = VOICES[voice_key]
            text_for_synth = ar
            applied_diac = False
            if backend == "azure" and args.diacritize:
                text_for_synth = diacritize(ar)
                applied_diac = text_for_synth != ar
            try:
                if backend == "edge":
                    await synth_edge(text_for_synth, voice_full, out, rate)
                else:
                    await synth_azure(
                        text_for_synth, voice_full, out, rate,
                        azure_region, azure_key, lexicon,
                    )
                manifest.setdefault(voice_key, {})[str(wid)] = {
                    "text": ar,
                    "hash": text_hash(ar),
                    "edge_voice": voice_full,
                    "rate": rate,
                    "backend": backend,
                    "diacritized": applied_diac,
                    "lexicon_hash": lexicon_hash if backend == "azure" else None,
                }
                print(f"ok   {voice_key}/{wid} [{reason}] {ar}")
            except Exception as e:
                print(f"ERR  {voice_key}/{wid} {ar}: {e}", file=sys.stderr)

    await asyncio.gather(*(bounded(vk, wid, ar, r) for vk, wid, ar, r in todo))

    # Drop stale manifest entries for ids that no longer exist in sources.
    valid_ids = {str(wid) for wid, _ in parse_words()}
    for v in voice_keys:
        for old_id in list(manifest.get(v, {}).keys()):
            if old_id not in valid_ids:
                del manifest[v][old_id]

    save_manifest(manifest)
    print(f"Done. Manifest written to {MANIFEST.relative_to(ROOT)}")

    if args.upload:
        upload_to_blob(voice_keys, todo)


def upload_to_blob(voice_keys, todo):
    """Upload regenerated mp3s + manifest to Azure Blob Storage.

    Container: huroofaudio6813/audio (public read).
    Only files that were just regenerated (in `todo`) are pushed, plus
    the manifest. Use --force --upload to push everything.
    """
    import subprocess
    sa = os.environ.get("AZURE_STORAGE_ACCOUNT", "huroofaudio6813")
    container = os.environ.get("AZURE_STORAGE_CONTAINER", "audio")
    key = os.environ.get("AZURE_STORAGE_KEY")
    if not key:
        try:
            key = subprocess.check_output([
                "az", "storage", "account", "keys", "list",
                "-g", os.environ.get("AZURE_RESOURCE_GROUP", "huroof-au-rg"),
                "-n", sa, "--query", "[0].value", "-o", "tsv",
            ], text=True).strip()
        except Exception as e:
            print(f"[upload] cannot fetch storage key: {e}", file=sys.stderr)
            return

    paths = [(f"{vk}/{wid}.mp3", OUT_DIR / vk / f"{wid}.mp3")
             for vk, wid, _, _ in todo]
    paths.append(("manifest.json", MANIFEST))
    print(f"[upload] pushing {len(paths)} blobs to {sa}/{container} …")
    for blob_name, src in paths:
        if not src.exists():
            continue
        cache = ("public, max-age=300" if blob_name == "manifest.json"
                 else "public, max-age=31536000, immutable")
        cmd = [
            "az", "storage", "blob", "upload",
            "--account-name", sa, "--account-key", key,
            "--container-name", container,
            "--file", str(src), "--name", blob_name,
            "--overwrite", "--content-cache", cache,
            "--no-progress", "-o", "none",
        ]
        try:
            subprocess.check_call(cmd)
        except subprocess.CalledProcessError as e:
            print(f"[upload] failed {blob_name}: {e}", file=sys.stderr)
    print("[upload] done.")


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--voice", choices=list(VOICES) + ["all"], default="rana")
    p.add_argument("--backend", choices=["edge", "azure"], default="edge")
    p.add_argument("--diacritize", action="store_true",
                   help="Apply Mishkal diacritization (Azure only).")
    p.add_argument("--force", action="store_true")
    p.add_argument("--check", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--ids", type=str, default="")
    p.add_argument("--rate", type=str, default="")
    p.add_argument("--concurrency", type=int, default=3)
    p.add_argument("--upload", action="store_true",
                   help="After generation, upload to Azure Blob Storage "
                        "(huroofaudio6813/audio). Requires AZURE_STORAGE_KEY "
                        "or AZURE_STORAGE_CONNECTION_STRING.")
    return p.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
