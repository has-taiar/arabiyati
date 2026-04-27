// games/flashcard.js

function mountFlashcard(container, { words, onComplete }) {
  let idx = 0;
  let flipped = false;
  const results = { correct: 0, total: words.length, missed: [] };

  function render() {
    const w = words[idx];
    Speech.cancel();
    container.innerHTML = `
      <div class="flashcard-scene" id="fc-scene">
        <div class="flashcard-inner">
          <div class="flashcard-face flashcard-front">
            <span class="flashcard-visual">${w.visual}</span>
            <span class="flashcard-arabic arabic">${w.arabic}</span>
            <div class="say-it-row">
              <div class="say-it-prompt" id="fc-say-it"></div>
              <button class="speak-btn" id="fc-speak" title="Hear it · اسمع">🔊</button>
            </div>
            <span class="flashcard-tap-hint">Tap to flip · اضغط للقلب</span>
          </div>
          <div class="flashcard-face flashcard-back">
            <span class="flashcard-visual">${w.visual}</span>
            <span class="flashcard-english">${w.english}</span>
            <span class="flashcard-pronunciation">${w.pronunciation}</span>
            <span class="flashcard-arabic arabic" style="font-size:1.6rem;margin-top:6px;">${w.arabic}</span>
          </div>
        </div>
      </div>
      <div class="self-report-row" id="report-row" style="display:none;">
        <button class="btn-knew-it" id="btn-knew">✓ I knew it! · عرفتها!</button>
        <button class="btn-still-learning" id="btn-learn">Still learning · أتعلم</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
        <button class="btn btn-secondary" id="fc-prev" ${idx === 0 ? 'disabled' : ''}>← Prev</button>
        <span style="font-size:0.85rem;color:#888;">${idx + 1} / ${words.length}</span>
        <button class="btn btn-secondary" id="fc-next" ${idx === words.length - 1 ? 'disabled style="opacity:0.4"' : ''}>Next →</button>
      </div>
    `;

    // Speech: "Say it" prompt → auto-speak after delay
    Speech.scheduleSpeak(w, { promptEl: document.getElementById('fc-say-it') });
    document.getElementById('fc-speak').addEventListener('click', (e) => {
      e.stopPropagation();
      Speech.speakWord(w);
    });

    document.getElementById('fc-scene').addEventListener('click', () => {
      flipped = !flipped;
      document.getElementById('fc-scene').classList.toggle('flipped', flipped);
      document.getElementById('report-row').style.display = flipped ? 'flex' : 'none';
    });

    document.getElementById('btn-knew').addEventListener('click', () => {
      results.correct++;
      advance();
    });
    document.getElementById('btn-learn').addEventListener('click', () => {
      results.missed.push(w);
      advance();
    });

    const prev = document.getElementById('fc-prev');
    const next = document.getElementById('fc-next');
    if (prev) prev.addEventListener('click', () => { idx--; flipped = false; render(); });
    if (next) next.addEventListener('click', () => { advance(true); });
  }

  function advance(skipReport = false) {
    Speech.cancel();
    if (!skipReport && flipped) {
      // already handled by knew-it / still-learning
    }
    if (idx < words.length - 1) {
      idx++;
      flipped = false;
      render();
    } else {
      onComplete(results);
    }
  }

  render();
}
