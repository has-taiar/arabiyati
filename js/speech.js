// speech.js — Web Speech API wrapper
// Robust cross-browser/iOS implementation:
//   • Unlocks audio context on first user gesture (iOS Safari requirement)
//   • Speaks synchronously (no inner setTimeout breaking gesture chain)
//   • keepAlive interval prevents Chrome from silently pausing synthesis

const Speech = (() => {
  const MUTE_KEY = 'arabiyati_speech_muted';
  let _arabicVoice = null;
  let _pendingTimeout = null;
  let _voiceRetries = 0;
  let _unlocked = false;

  // ── Support & Mute ────────────────────────────────────────────────────────
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

  // ── Voice loading ─────────────────────────────────────────────────────────
  function _loadVoices() {
    if (!isSupported()) return;
    const voices = window.speechSynthesis.getVoices();
    _arabicVoice =
      voices.find(v => v.lang === 'ar-IQ') ||
      voices.find(v => v.lang === 'ar-SA') ||
      voices.find(v => v.lang === 'ar-AE') ||
      voices.find(v => v.lang === 'ar-EG') ||
      voices.find(v => v.lang.startsWith('ar')) ||
      null;
    // Retry if voices list is empty (Chrome loads async)
    if (!_arabicVoice && voices.length === 0 && _voiceRetries < 10) {
      _voiceRetries++;
      setTimeout(_loadVoices, 300);
    }
  }

  // ── Audio unlock (iOS Safari) ─────────────────────────────────────────────
  // iOS blocks speechSynthesis until a synchronous user-gesture call is made.
  // We fire a silent utterance on the very first user interaction.
  function _unlock() {
    if (_unlocked || !isSupported()) return;
    _unlocked = true;
    const silent = new SpeechSynthesisUtterance('');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);

    // Chrome keepAlive: resume() every 10s to prevent silent pause bug
    setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      }
    }, 10000);
  }

  // ── Core speak (synchronous — no inner setTimeout) ────────────────────────
  function _doSpeak(text, lang) {
    if (!isSupported() || isMuted()) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const utt = new SpeechSynthesisUtterance(text);
    if (lang === 'ar' && _arabicVoice) {
      utt.voice = _arabicVoice;
      utt.lang = _arabicVoice.lang;
    } else {
      utt.lang = lang === 'ar' ? 'ar-IQ' : 'en-US';
    }
    utt.rate = 0.82;
    utt.pitch = 1.05;
    utt.onerror = () => {}; // suppress uncaught error events
    window.speechSynthesis.speak(utt);
  }

  // Public: speak a word object (Arabic if voice available, else phonetic)
  function speakWord(word) {
    if (isMuted() || !isSupported()) return;
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

  // ── scheduleSpeak ─────────────────────────────────────────────────────────
  // Shows "Say it!" prompt, waits delay ms, then auto-speaks.
  function scheduleSpeak(word, { promptEl = null, delay = 2800 } = {}) {
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

  // ── Init ──────────────────────────────────────────────────────────────────
  if (isSupported()) {
    _loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', _loadVoices);
    // Pre-unlock on first touch/click anywhere — critical for iOS Safari
    ['click', 'touchstart', 'keydown'].forEach(e =>
      document.addEventListener(e, _unlock, { once: true, passive: true })
    );
  }

  return { isSupported, isMuted, setMuted, toggleMuted, speakWord, cancel, scheduleSpeak };
})();


  // ── Support & Mute ────────────────────────────────────────────────────────
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

  // ── Voice loading ─────────────────────────────────────────────────────────
  function _loadVoices() {
    if (!isSupported()) return;
    const voices = window.speechSynthesis.getVoices();
    _arabicVoice =
      voices.find(v => v.lang === 'ar-IQ') ||
      voices.find(v => v.lang === 'ar-SA') ||
      voices.find(v => v.lang === 'ar-AE') ||
      voices.find(v => v.lang === 'ar-EG') ||
      voices.find(v => v.lang.startsWith('ar')) ||
      null;
    // Retry up to 10 times if voices haven't loaded yet (Chrome async loading)
    if (!_arabicVoice && voices.length === 0 && _voiceRetries < 10) {
      _voiceRetries++;
      setTimeout(_loadVoices, 300);
    }
  }

  // ── Core speak ────────────────────────────────────────────────────────────
  function _doSpeak(text, lang) {
    if (!isSupported() || isMuted()) return;

    // Chrome bug: synthesis can get silently paused after page idle.
    // Must cancel(), then resume(), then speak() with a small delay.
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const utt = new SpeechSynthesisUtterance(text);
    if (lang === 'ar' && _arabicVoice) {
      utt.voice = _arabicVoice;
      utt.lang = _arabicVoice.lang;
    } else {
      utt.lang = lang === 'ar' ? 'ar-IQ' : 'en-US';
    }
    utt.rate = 0.82;   // slightly slow for kids
    utt.pitch = 1.05;

    // Small delay ensures cancel() has fully settled before speak() (Chrome quirk)
    setTimeout(() => {
      if (!isMuted()) window.speechSynthesis.speak(utt);
    }, 80);
  }

  // Speak a word object — Arabic if voice available, else phonetic pronunciation
  function speakWord(word) {
    if (isMuted() || !isSupported()) return;
    // Re-try loading voices if they weren't ready at init time
    if (!_arabicVoice) _loadVoices();
    if (_arabicVoice) {
      _doSpeak(word.arabic, 'ar');
    } else {
      // Fall back to reading the pronunciation guide in English
      _doSpeak(word.pronunciation, 'en');
    }
  }

  function cancel() {
    if (_pendingTimeout) { clearTimeout(_pendingTimeout); _pendingTimeout = null; }
    if (isSupported()) window.speechSynthesis.cancel();
  }

  // ── scheduleSpeak ─────────────────────────────────────────────────────────
  // Shows a "Say it!" prompt, waits `delay` ms, then auto-speaks.
  // If speech is muted or unsupported, hides the prompt element.
  function scheduleSpeak(word, { promptEl = null, delay = 2800 } = {}) {
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

  // ── Init ──────────────────────────────────────────────────────────────────
  if (isSupported()) {
    _loadVoices();
    // Chrome loads voices async — voiceschanged fires when list is ready
    window.speechSynthesis.addEventListener('voiceschanged', _loadVoices);
  }

  return { isSupported, isMuted, setMuted, toggleMuted, speakWord, cancel, scheduleSpeak };
})();
