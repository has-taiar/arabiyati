// speech.js — Web Speech API wrapper with diagnostic logging
//
// Known issues addressed:
//   • iOS Safari requires a sync gesture call to unlock audio
//   • Chrome silently pauses synthesis after ~15s idle (keepAlive)
//   • Firefox / Chrome bug: cancel() right before speak() can swallow the utterance
//   • Brave blocks speechSynthesis voices via privacy shields
//
// All operations log to console with [Speech] prefix.

const Speech = (() => {
  const MUTE_KEY = 'arabiyati_speech_muted';
  const LOG  = (...a) => { try { console.log('[Speech]', ...a); } catch (e) {} };
  const WARN = (...a) => { try { console.warn('[Speech]', ...a); } catch (e) {} };

  let _arabicVoice = null;
  let _pendingTimeout = null;
  let _voiceRetries = 0;
  let _unlocked = false;
  let _bannerShown = false;

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
    LOG(next ? 'muted' : 'unmuted');
    return next;
  }

  function _loadVoices() {
    if (!isSupported()) return;
    const voices = window.speechSynthesis.getVoices();
    LOG(`_loadVoices: ${voices.length} voices available`);
    _arabicVoice =
      voices.find(v => v.lang === 'ar-IQ') ||
      voices.find(v => v.lang === 'ar-SA') ||
      voices.find(v => v.lang === 'ar-AE') ||
      voices.find(v => v.lang === 'ar-EG') ||
      voices.find(v => v.lang && v.lang.startsWith('ar')) ||
      null;
    if (_arabicVoice) {
      LOG('Arabic voice selected:', _arabicVoice.name, _arabicVoice.lang);
    } else if (voices.length > 0) {
      LOG('No Arabic voice found among', voices.length, 'voices. Will use English fallback.');
    }
    if (!_arabicVoice && voices.length === 0 && _voiceRetries < 8) {
      _voiceRetries++;
      setTimeout(_loadVoices, 400);
    } else if (voices.length === 0 && _voiceRetries >= 8) {
      LOG('No native voices — will use audio-URL fallback');
    }
  }

  function _showBrowserBanner() {
    if (_bannerShown || typeof document === 'undefined') return;
    _bannerShown = true;
    const isBrave = !!(navigator.brave && typeof navigator.brave.isBrave === 'function');
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#FFCDD2;color:#B71C1C;padding:10px 14px;font-size:0.85rem;text-align:center;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:sans-serif;';
    banner.innerHTML = (isBrave
      ? '⚠️ <b>Brave is blocking audio.</b> Click the Brave shield icon next to the URL and turn shields <b>OFF</b> for this site, then reload.'
      : '⚠️ <b>No text-to-speech voices available.</b> Try Chrome, Edge, or Safari, or install OS speech voices.')
      + ' <button style="margin-left:10px;padding:2px 8px;border:none;background:#B71C1C;color:white;border-radius:4px;cursor:pointer;" onclick="this.parentNode.remove()">✕</button>';
    document.body.appendChild(banner);
  }

  function _unlock() {
    if (_unlocked || !isSupported()) return;
    _unlocked = true;
    LOG('Unlocking audio engine on first user gesture');
    try {
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    } catch (e) { WARN('Unlock utterance failed:', e); }
    setInterval(() => {
      if (window.speechSynthesis && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        try { window.speechSynthesis.resume(); } catch (e) {}
      }
    }, 10000);
  }

  function _doSpeak(text, lang) {
    if (!isSupported() || isMuted()) {
      LOG('_doSpeak skipped — supported:', isSupported(), 'muted:', isMuted());
      return;
    }
    LOG(`Speaking: "${text}" [${lang}]`);

    const synth = window.speechSynthesis;
    const wasBusy = synth.speaking || synth.pending;
    if (wasBusy) synth.cancel();
    try { synth.resume(); } catch (e) {}

    const utt = new SpeechSynthesisUtterance(text);
    if (lang === 'ar' && _arabicVoice) {
      utt.voice = _arabicVoice;
      utt.lang = _arabicVoice.lang;
    } else {
      utt.lang = lang === 'ar' ? 'ar-IQ' : 'en-US';
    }
    utt.rate = 0.82;
    utt.pitch = 1.05;
    utt.onstart = () => LOG('utterance started');
    utt.onend   = () => LOG('utterance ended');
    utt.onerror = (e) => WARN('utterance error:', e.error || e);

    const speakNow = () => synth.speak(utt);
    if (wasBusy) setTimeout(speakNow, 60);
    else speakNow();
  }

  function speakWord(word) {
    if (!word) return;
    if (isMuted()) { LOG('speakWord blocked — muted'); return; }
    _unlock();
    if (isSupported()) {
      if (!_arabicVoice) _loadVoices();
      if (_arabicVoice) {
        _doSpeak(word.arabic, 'ar');
        return;
      }
    }
    // Fallback path: no Arabic voice (Brave / no OS voices) — use audio URL
    LOG('Using audio-URL fallback for:', word.arabic);
    _playAudioFallback(word.arabic);
  }

  // Audio fallback using Google Translate TTS (works in Brave / no-voice envs).
  // Plain <audio> tag bypasses fetch CORS for media.
  let _audioEl = null;
  function _playAudioFallback(text) {
    try {
      if (!_audioEl) {
        _audioEl = new Audio();
        _audioEl.preload = 'auto';
        _audioEl.onerror = () => WARN('Audio fallback failed to load');
        _audioEl.onplay  = () => LOG('Audio fallback playing');
      }
      _audioEl.pause();
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ar&q=${encodeURIComponent(text)}`;
      _audioEl.src = url;
      const p = _audioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(err => WARN('Audio fallback play() rejected:', err));
      }
    } catch (e) {
      WARN('Audio fallback exception:', e);
    }
  }

  function cancel() {
    if (_pendingTimeout) { clearTimeout(_pendingTimeout); _pendingTimeout = null; }
    if (isSupported()) {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) synth.cancel();
    }
    if (_audioEl) { try { _audioEl.pause(); } catch (e) {} }
  }

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

  function diagnose() {
    if (!isSupported()) return { supported: false, voiceCount: 0, arabicVoices: [], selectedVoice: 'N/A' };
    const voices = window.speechSynthesis.getVoices();
    return {
      supported: true,
      unlocked: _unlocked,
      muted: isMuted(),
      voiceCount: voices.length,
      arabicVoices: voices.filter(v => v.lang && v.lang.startsWith('ar')).map(v => `${v.name} (${v.lang})`),
      selectedVoice: _arabicVoice ? `${_arabicVoice.name} (${_arabicVoice.lang})` : 'NONE — using English fallback',
      userAgent: navigator.userAgent,
    };
  }

  if (isSupported()) {
    LOG('Web Speech API supported. Initialising...');
    _loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', _loadVoices);
    ['click', 'touchstart', 'keydown'].forEach(e =>
      document.addEventListener(e, _unlock, { once: true, passive: true })
    );
  } else {
    WARN('Web Speech API NOT supported in this browser');
  }

  return { isSupported, isMuted, setMuted, toggleMuted, speakWord, cancel, scheduleSpeak, diagnose };
})();
