// speech.js — Pre-rendered MP3 playback (primary) + echo-back recorder
//
// Architecture:
//   • Each word has a pre-generated audio/{id}.mp3 (Azure ar-IQ-RanaNeural via edge-tts)
//   • Plain <audio> element — works in every browser including Brave
//   • Browser caches each file after first play → instant subsequent playback
//   • Echo-back: MediaRecorder → in-memory Blob → playback → discard. No persistence.

const Speech = (() => {
  const MUTE_KEY = 'arabiyati_speech_muted';
  const MIC_OK_KEY = 'arabiyati_mic_consent';
  const VOICE_KEY = 'arabiyati_speech_voice';
  // Audio is served from Azure Blob Storage (public-read CDN). Falls back to
  // local relative path when running from file:// or if window.AUDIO_BASE_URL
  // override is set (useful for local dev with `python -m http.server`).
  const AUDIO_BASE = (typeof window !== 'undefined' && window.AUDIO_BASE_URL)
    ? window.AUDIO_BASE_URL
    : 'https://huroofaudio6813.blob.core.windows.net/audio/';
  const VALID_VOICES = ['rana', 'bassel'];
  const DEFAULT_VOICE = 'rana';
  const LOG = (...a) => { try { console.log('[Speech]', ...a); } catch (e) {} };
  const WARN = (...a) => { try { console.warn('[Speech]', ...a); } catch (e) {} };

  let _audioEl = null;
  let _pendingTimeout = null;
  // Monotonic token: every speakWord/scheduleSpeak/cancel bumps this. A
  // pending audio.play() promise that resolves after a newer call started
  // will be ignored, preventing overlapping playback.
  let _playToken = 0;

  // ── Mute ──────────────────────────────────────────────────────────────────
  function isMuted() { return localStorage.getItem(MUTE_KEY) === '1'; }
  function setMuted(val) {
    localStorage.setItem(MUTE_KEY, val ? '1' : '0');
    if (val) cancel();
  }
  function toggleMuted() {
    const next = !isMuted();
    setMuted(next);
    return next;
  }

  // ── Voice selection (rana / bassel) ───────────────────────────────────────
  function getVoice() {
    // Prefer the active profile's choice, fall back to localStorage, then default.
    try {
      if (typeof profile !== 'undefined' && profile && profile.voice && VALID_VOICES.includes(profile.voice)) {
        return profile.voice;
      }
    } catch (e) {}
    const v = localStorage.getItem(VOICE_KEY);
    return VALID_VOICES.includes(v) ? v : DEFAULT_VOICE;
  }
  function setVoice(v) {
    if (!VALID_VOICES.includes(v)) return;
    localStorage.setItem(VOICE_KEY, v);
    cancel();
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  function _ensureAudio() {
    if (!_audioEl) {
      _audioEl = new Audio();
      _audioEl.preload = 'auto';
      _audioEl.onerror = (e) => WARN('Audio error:', _audioEl.error);
      _audioEl.onplay = () => LOG('playing');
      _audioEl.onended = () => LOG('ended');
    }
    return _audioEl;
  }

  function speakWord(word) {
    if (!word || isMuted()) return;
    // Always cancel any pending auto-speak timer & in-flight audio first
    if (_pendingTimeout) { clearTimeout(_pendingTimeout); _pendingTimeout = null; }
    const myToken = ++_playToken;
    const a = _ensureAudio();
    try { a.pause(); a.currentTime = 0; } catch (e) {}
    const targetSrc = AUDIO_BASE + getVoice() + '/' + word.id + '.mp3';
    a.src = targetSrc;
    a.load();   // abort any in-flight previous load
    LOG('speakWord', word.arabic, '→', a.src, 'token', myToken);
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(err => WARN('play() rejected:', err && err.message));
      // If a NEWER speakWord started a different src while this play() was
      // still resolving, the audio element is already playing the new clip.
      // Don't pause it — just leave it alone. (Previous logic incorrectly
      // paused the new clip whenever the token had advanced.)
      // We only pause if the src was reverted to ours but token advanced,
      // which can't happen with a single shared element, so this becomes
      // a no-op safety check.
    }
  }

  function cancel() {
    _playToken++;
    if (_pendingTimeout) { clearTimeout(_pendingTimeout); _pendingTimeout = null; }
    if (_audioEl) { try { _audioEl.pause(); } catch (e) {} }
  }

  // ── scheduleSpeak: show "Say it!" prompt → auto-play after delay ──────────
  function scheduleSpeak(word, opts) {
    opts = opts || {};
    const promptEl = opts.promptEl || null;
    const delay = typeof opts.delay === 'number' ? opts.delay : 2800;
    cancel();

    if (isMuted()) {
      if (promptEl) promptEl.style.display = 'none';
      return;
    }

    if (promptEl) {
      promptEl.textContent = '🗣️ Say it! · قولها!';
      promptEl.className = 'say-it-prompt';
      promptEl.style.display = '';
      promptEl.style.cursor = 'pointer';
      promptEl.title = 'Tap to hear · اضغط لتسمع';
      promptEl.onclick = (e) => { e.stopPropagation(); speakWord(word); };
    }

    _pendingTimeout = setTimeout(() => {
      _pendingTimeout = null;
      speakWord(word);
      if (promptEl) {
        promptEl.textContent = '🔊 Listen! · اسمع!';
        promptEl.classList.add('heard');
        setTimeout(() => {
          if (promptEl) promptEl.classList.remove('heard');
        }, 2200);
      }
    }, delay);
  }

  // ── Echo-back recorder ────────────────────────────────────────────────────
  // Records ~2.5s from mic, plays it back via an in-memory WAV blob, then
  // discards. Nothing leaves the device. Uses Web Audio (no MediaRecorder)
  // so it works on iOS Safari/Brave/Chrome — those WKWebView browsers all
  // mishandle MediaRecorder blobs.
  let _stream = null;
  let _recBlobUrl = null;

  function micConsented() { return localStorage.getItem(MIC_OK_KEY) === '1'; }
  function setMicConsented() { localStorage.setItem(MIC_OK_KEY, '1'); }

  function _isIOS() {
    // iOS Safari/Brave/Chrome (all WKWebView) and iPadOS (which masquerades as Mac)
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  async function _ensureStream() {
    if (_stream) return _stream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone not supported in this browser');
    }
    _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return _stream;
  }

  // ── WAV encoder (used as the universal record path; works on iOS Brave) ──
  // iOS WebKit's MediaRecorder is unreliable: Blob.type is often empty and
  // the resulting blob refuses to play back. We avoid it entirely by capturing
  // raw PCM via AudioContext and encoding a WAV blob ourselves.
  async function _recordWav(stream, ms) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext not supported');
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) {}
    }
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but universally available, including iOS.
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    proc.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      // Copy: the buffer is reused.
      const copy = new Float32Array(data.length);
      copy.set(data);
      chunks.push(copy);
    };
    source.connect(proc);
    // iOS requires the node to be connected to destination, but we don't want
    // to hear ourselves while recording → connect via a muted gain.
    const muted = ctx.createGain();
    muted.gain.value = 0;
    proc.connect(muted);
    muted.connect(ctx.destination);

    await _wait(ms);

    proc.disconnect();
    source.disconnect();
    muted.disconnect();
    const sampleRate = ctx.sampleRate;
    try { await ctx.close(); } catch (e) {}

    const totalLen = chunks.reduce((a, c) => a + c.length, 0);
    const flat = new Float32Array(totalLen);
    let off = 0;
    for (const c of chunks) { flat.set(c, off); off += c.length; }
    return _encodeWav(flat, sampleRate);
  }

  function _encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);          // PCM chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, 1, true);           // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate (mono · 16-bit)
    view.setUint16(32, 2, true);           // block align
    view.setUint16(34, 16, true);          // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let p = 44;
    for (let i = 0; i < samples.length; i++) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      p += 2;
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  // Returns { state: 'recording'|'playing'|'done'|'error', error?: string }
  // onState callback fires as state changes.
  async function recordAndPlayback(opts) {
    opts = opts || {};
    const onState = opts.onState || (() => {});
    const recordMs = opts.recordMs || 2500;

    // Privacy gate — show consent on first use
    if (!micConsented()) {
      const ok = confirm(
        "🎙️ Listen-to-yourself · اسمع نفسك\n\n" +
        "We'll record about 2-3 seconds from the mic so the kid can hear themselves say the word.\n\n" +
        "🔒 PRIVATE BY DESIGN:\n" +
        "  • Recording stays in this browser tab only\n" +
        "  • Nothing is uploaded, saved, or shared\n" +
        "  • The recording is deleted as soon as it plays back\n\n" +
        "Allow microphone use?"
      );
      if (!ok) { onState({ state: 'error', error: 'declined' }); return; }
      setMicConsented();
    }

    try {
      cancel();

      // Record
      onState({ state: 'recording' });
      const stream = await _ensureStream();
      const blob = await _recordWav(stream, recordMs);

      // Playback
      if (_recBlobUrl) URL.revokeObjectURL(_recBlobUrl);
      _recBlobUrl = URL.createObjectURL(blob);
      const playback = new Audio();
      // playsInline is required on iOS so audio doesn't try to fullscreen
      // (also avoids the orange "media element busy" lockup in Brave/iOS).
      playback.playsInline = true;
      playback.setAttribute('playsinline', '');
      playback.preload = 'auto';
      playback.src = _recBlobUrl;
      onState({ state: 'playing' });
      try {
        await playback.play();
      } catch (err) {
        WARN('playback.play() rejected:', err && err.message);
        throw err;
      }
      await new Promise(res => {
        playback.onended = res;
        playback.onerror = res;
      });

      // Discard everything
      URL.revokeObjectURL(_recBlobUrl);
      _recBlobUrl = null;
      onState({ state: 'done' });
    } catch (e) {
      WARN('recordAndPlayback failed:', e);
      // Release the mic stream on failure so the next attempt can re-prompt
      // (helps recover if the user denied permission then changed their mind).
      if (_stream) {
        try { _stream.getTracks().forEach(t => t.stop()); } catch (err) {}
        _stream = null;
      }
      onState({ state: 'error', error: e.message || String(e) });
    }
  }

  function _wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  function micSupported() {
    // We use AudioContext + getUserMedia (no MediaRecorder dependency) so the
    // path works on iOS Brave/Safari/Chrome too.
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
              (window.AudioContext || window.webkitAudioContext));
  }

  function diagnose() {
    return {
      muted: isMuted(),
      micConsented: micConsented(),
      micSupported: micSupported(),
      audioBase: AUDIO_BASE,
    };
  }

  return {
    speakWord, cancel, scheduleSpeak,
    isMuted, setMuted, toggleMuted,
    getVoice, setVoice, VALID_VOICES,
    recordAndPlayback, micSupported, micConsented,
    diagnose,
    // back-compat shims (some callers still expect these):
    isSupported: () => true,
  };
})();
