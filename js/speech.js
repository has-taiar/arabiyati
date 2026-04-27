// speech.js — Web Speech API wrapper
// Robust cross-browser/iOS implementation:
//   • Unlocks audio on first user gesture (iOS Safari requirement)
//   • Speaks synchronously in core path (no nested setTimeout breaking gesture)
//   • keepAlive interval prevents Chrome from silently pausing synthesis

const Speech = (() => {
  const MUTE_KEY = 'arabiyati_speech_muted';
  let _arabicVoice = null;
  let _pendingTimeout = null;
  let _voiceRetries = 0;
  let _unlocked = false;

  function isSupported() {
    return typeof window !== 'undefined' && !!window.speechSynthesis;
  }

  function isMuted() {
    return localStorage.getItem(MUTE_KEY) === '1';
  }

  function setMuted(val) {
    localStorage.setItem(MUTE_KEY, val ? '1' : '0');
    if (val) cancel();
  }

  function toggleMuted() {
    const next = !isMuted();
    setMuted(next);
    return next;
  }

  function _loadVoices() {
    if (!isSupported()) return;
    const voices = window.speechSynthesis.getVoices();
    _arabicVoice =
      voices.find(v => v.lang === 'ar-IQ') ||
      voices.find(v => v.lang === 'ar-SA') ||
      voices.find(v => v.lang === 'ar-AE') ||
      voices.find(v => v.lang === 'ar-EG') ||
      voices.find(v => v.lang && v.lang.startsWith('ar')) ||
      null;
    if (!_arabicVoice && voices.length === 0 && _voiceRetries < 10) {
      _voiceRetries++;
      setTimeout(_loadVoices, 300);
    }
  }

  // iOS Safari blocks speechSynthesis until a synchronous user-gesture call is made.
  function _unlock() {
    if (_unlocked || !isSupported()) return;
    _unlocked = true;
    try {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    } catch (e) {}
    // Chrome keepAlive: prevents silent pause after ~15s idle
    setInterval(() => {
      if (window.speechSynthesis && !window.speechSynthesis.speaking) {
        try { window.speechSynthesis.resume(); } catch (e) {}
      }
    }, 10000);
  }

  function _doSpeak(text, lang) {
    if (!isSupported() || isMuted()) return;
    window.speechSynthesis.cancel();
    try { window.speechSynthesis.resume(); } catch (e) {}

    const utt = new SpeechSynthesisUtterance(text);
    if (lang === 'ar' && _arabicVoice) {
      utt.voice = _arabicVoice;
      utt.lang = _arabicVoice.lang;
    } else {
      utt.lang = lang === 'ar' ? 'ar-IQ' : 'en-US';
    }
    utt.rate = 0.82;
    utt.pitch = 1.05;
    utt.onerror = () => {};
    window.speechSynthesis.speak(utt);
  }

  function speakWord(word) {
    if (isMuted() || !isSupported() || !word) return;
    _unlock();
    if (!_arabicVoice) _loadVoices();
    if (_arabicVoice) {
      _doSpeak(word.arabic, 'ar');
    } else {
      _doSpeak(word.pronunciation, 'en');
    }
  }

  function cancel() {
    if (_pendingTimeout) { clearTimeout(_pendingTimeout); _pendingTimeout = null; }
    if (isSupported()) window.speechSynthesis.cancel();
  }

  function scheduleSpeak(word, opts) {
    opts = opts || {};
    const promptEl = opts.promptEl || null;
    const delay = typeof opts.delay === 'number' ? opts.delay : 2800;
    cancel();

    if (!isSupported() || isMuted()) {
      if (promptEl) promptEl.style.display = 'none';
      return;
    }

    if (promptEl) {
      promptEl.textContent = '🗣️ Say it! · قولها!';
      promptEl.className = 'say-it-prompt';
      promptEl.style.display = '';
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

  function diagnose() {
    if (!isSupported()) return { supported: false, voices: 0, arabic: null, browser: navigator.userAgent };
    const voices = window.speechSynthesis.getVoices();
    return {
      supported: true,
      unlocked: _unlocked,
      muted: isMuted(),
      voiceCount: voices.length,
      arabicVoices: voices.filter(v => v.lang && v.lang.startsWith('ar')).map(v => `${v.name} (${v.lang})`),
      selectedVoice: _arabicVoice ? `${_arabicVoice.name} (${_arabicVoice.lang})` : 'NONE — using English fallback',
    };
  }

  if (isSupported()) {
    _loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', _loadVoices);
    ['click', 'touchstart', 'keydown'].forEach(e =>
      document.addEventListener(e, _unlock, { once: true, passive: true })
    );
  }

  return { isSupported, isMuted, setMuted, toggleMuted, speakWord, cancel, scheduleSpeak, diagnose };
})();
