// speech.js — Web Speech API wrapper
// Flow per word: show "Say it!" prompt → wait ~3s → auto-speak → show "Listen!" briefly

const Speech = (() => {
  const MUTE_KEY = 'arabiyati_speech_muted';
  let _arabicVoice = null;
  let _pendingTimeout = null;

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
    // Prefer Gulf Arabic dialects first, then any Arabic voice
    _arabicVoice =
      voices.find(v => v.lang === 'ar-IQ') ||
      voices.find(v => v.lang === 'ar-SA') ||
      voices.find(v => v.lang === 'ar-AE') ||
      voices.find(v => v.lang === 'ar-EG') ||
      voices.find(v => v.lang.startsWith('ar')) ||
      null;
  }

  // ── Core speak ────────────────────────────────────────────────────────────
  function _doSpeak(text, lang) {
    if (!isSupported() || isMuted()) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (lang === 'ar' && _arabicVoice) {
      utt.voice = _arabicVoice;
      utt.lang = _arabicVoice.lang;
    } else {
      utt.lang = lang === 'ar' ? 'ar-IQ' : 'en-US';
    }
    utt.rate = 0.82;   // slightly slow for kids
    utt.pitch = 1.05;
    window.speechSynthesis.speak(utt);
  }

  // Speak a word object — Arabic if voice available, else phonetic pronunciation
  function speakWord(word) {
    if (isMuted() || !isSupported()) return;
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
    // Chrome loads voices async
    window.speechSynthesis.addEventListener('voiceschanged', _loadVoices);
  }

  return { isSupported, isMuted, setMuted, toggleMuted, speakWord, cancel, scheduleSpeak };
})();
