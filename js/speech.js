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
  const AUDIO_BASE = 'audio/';
  const LOG = (...a) => { try { console.log('[Speech]', ...a); } catch (e) {} };
  const WARN = (...a) => { try { console.warn('[Speech]', ...a); } catch (e) {} };

  let _audioEl = null;
  let _pendingTimeout = null;

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
    const a = _ensureAudio();
    try { a.pause(); a.currentTime = 0; } catch (e) {}
    a.src = AUDIO_BASE + word.id + '.mp3';
    a.load();   // abort any in-flight previous load
    LOG('speakWord', word.arabic, '→', a.src);
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(err => WARN('play() rejected (likely needs user gesture):', err && err.message));
    }
  }

  function cancel() {
    if (_pendingTimeout) { clearTimeout(_pendingTimeout); _pendingTimeout = null; }
    if (_audioEl) { try { _audioEl.pause(); } catch (e) {} }
    if (_recorder && _recorder.state === 'recording') {
      try { _recorder.stop(); } catch (e) {}
    }
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
  // Records 2s from mic, plays it back, then discards. Nothing leaves device.
  let _recorder = null;
  let _stream = null;
  let _recBlobUrl = null;

  function micConsented() { return localStorage.getItem(MIC_OK_KEY) === '1'; }
  function setMicConsented() { localStorage.setItem(MIC_OK_KEY, '1'); }

  async function _ensureStream() {
    if (_stream) return _stream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone not supported in this browser');
    }
    _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return _stream;
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
      const chunks = [];
      _recorder = new MediaRecorder(stream);
      _recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      const stopped = new Promise(res => { _recorder.onstop = () => res(); });
      _recorder.start();
      await _wait(recordMs);
      if (_recorder.state === 'recording') _recorder.stop();
      await stopped;

      // Playback
      const mimeType = (chunks[0] && chunks[0].type) || 'audio/webm';
      const blob = new Blob(chunks, { type: mimeType });
      if (_recBlobUrl) URL.revokeObjectURL(_recBlobUrl);
      _recBlobUrl = URL.createObjectURL(blob);
      const playback = new Audio(_recBlobUrl);
      onState({ state: 'playing' });
      await playback.play();
      await new Promise(res => { playback.onended = res; playback.onerror = res; });

      // Discard everything
      URL.revokeObjectURL(_recBlobUrl);
      _recBlobUrl = null;
      onState({ state: 'done' });
    } catch (e) {
      WARN('recordAndPlayback failed:', e);
      onState({ state: 'error', error: e.message || String(e) });
    }
  }

  function _wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  function micSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
              typeof MediaRecorder !== 'undefined');
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
    recordAndPlayback, micSupported, micConsented,
    diagnose,
    // back-compat shims (some callers still expect these):
    isSupported: () => true,
  };
})();
