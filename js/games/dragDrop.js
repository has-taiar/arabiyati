// games/dragDrop.js

function mountDragDrop(container, { words, onComplete, onStar, onCombo }) {
  // Present words in batches of 6 emoji tiles
  const batchSize = 6;
  let batchStart = 0;
  let comboCount = 0;
  const results = { correct: 0, total: words.length, missed: [], wrongAttempts: 0 };
  let pendingWords = [];
  let matchedCount = 0;

  function renderBatch() {
    const batch = words.slice(batchStart, batchStart + batchSize);
    pendingWords = [...batch];
    matchedCount = 0;

    container.innerHTML = `
      <div style="text-align:center;margin-bottom:6px;font-size:0.82rem;color:#777;">
        Drag the Arabic word onto the right picture<br>
        <span style="font-family:var(--font-ar)">اسحب الكلمة العربية على الصورة الصحيحة</span><br>
        <span style="font-size:0.78rem;color:var(--teal);">🔊 Tap a word to hear it · اضغط على الكلمة لتسمعها</span>
      </div>
      <div class="drag-label-row" id="drag-labels"></div>
      <div class="emoji-targets" id="emoji-targets"></div>
      <div class="feedback-msg" id="dd-fb"></div>
    `;

    const labelsEl = document.getElementById('drag-labels');
    const targetsEl = document.getElementById('emoji-targets');
    const shuffledLabels = shuffle([...batch]);

    // Create draggable labels
    shuffledLabels.forEach(w => {
      const lbl = document.createElement('div');
      lbl.className = 'drag-label';
      lbl.dataset.id = w.id;
      lbl.draggable = true;
      // Arabic text + small speaker button
      const textSpan = document.createElement('span');
      textSpan.textContent = w.arabic;
      const speakBtn = document.createElement('button');
      speakBtn.className = 'speak-btn-sm';
      speakBtn.textContent = '🔊';
      speakBtn.title = 'Hear it · اسمع';
      speakBtn.addEventListener('click', (e) => { e.stopPropagation(); Speech.speakWord(w); });
      lbl.appendChild(textSpan);
      lbl.appendChild(speakBtn);
      lbl.addEventListener('dragstart', onDragStart);
      // Touch support
      lbl.addEventListener('touchstart', onTouchStart, { passive: false });
      labelsEl.appendChild(lbl);
    });

    // Create emoji target tiles
    const shuffledTargets = shuffle([...batch]);
    shuffledTargets.forEach(w => {
      const tile = document.createElement('div');
      tile.className = 'emoji-tile';
      tile.dataset.id = w.id;
      tile.innerHTML = `<span>${w.visual}</span>`;
      tile.addEventListener('dragover', e => { e.preventDefault(); tile.classList.add('drag-over'); });
      tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));
      tile.addEventListener('drop', e => onDrop(e, tile));
      targetsEl.appendChild(tile);
    });
  }

  let dragId = null;

  function onDragStart(e) {
    dragId = e.target.dataset.id;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e, tile) {
    e.preventDefault();
    tile.classList.remove('drag-over');
    const tileId = tile.dataset.id;
    processMatch(dragId, tileId, tile);
    dragId = null;
  }

  // ── Touch drag implementation ──
  let touchEl = null;
  let ghost = null;

  function onTouchStart(e) {
    e.preventDefault();
    touchEl = e.currentTarget;
    dragId = touchEl.dataset.id;
    touchEl.classList.add('dragging');

    ghost = touchEl.cloneNode(true);
    ghost.style.cssText = `position:fixed;opacity:0.8;pointer-events:none;z-index:999;transform:scale(1.08);`;
    document.body.appendChild(ghost);
    movGhost(e.touches[0]);

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  function movGhost(touch) {
    if (!ghost) return;
    ghost.style.left = (touch.clientX - ghost.offsetWidth / 2) + 'px';
    ghost.style.top  = (touch.clientY - ghost.offsetHeight / 2) + 'px';
  }

  function onTouchMove(e) {
    e.preventDefault();
    movGhost(e.touches[0]);
    // Highlight tile under finger
    document.querySelectorAll('.emoji-tile').forEach(t => t.classList.remove('drag-over'));
    const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const tile = el && el.closest('.emoji-tile');
    if (tile) tile.classList.add('drag-over');
  }

  function onTouchEnd(e) {
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    if (ghost) { ghost.remove(); ghost = null; }
    if (touchEl) touchEl.classList.remove('dragging');

    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const tile = el && el.closest('.emoji-tile');
    document.querySelectorAll('.emoji-tile').forEach(t => t.classList.remove('drag-over'));

    if (tile && dragId) processMatch(dragId, tile.dataset.id, tile);
    dragId = null; touchEl = null;
  }

  function processMatch(lblId, tileId, tile) {
    const correct = lblId === tileId;
    const label = document.querySelector(`.drag-label[data-id="${lblId}"]`);
    const word = words.find(w => w.id == lblId);

    if (correct) {
      if (label) label.remove();
      tile.classList.add('matched');
      tile.innerHTML = `<span>${tile.querySelector('span').textContent}</span><span class="tile-word arabic">${word.arabic}</span>`;
      tile.dataset.matched = 'true';
      results.correct++;
      comboCount++;
      onStar && onStar(1);
      if (comboCount === 3) onCombo && onCombo(3);
      if (comboCount === 5) { onCombo && onCombo(5); onStar && onStar(2); }
      showFeedback(true);
      bounceTile(tile);
      matchedCount++;
      if (matchedCount === pendingWords.length) {
        batchStart += batchSize;
        if (batchStart < words.length) {
          setTimeout(() => renderBatch(), 600);
        } else {
          setTimeout(() => onComplete(results), 600);
        }
      }
    } else {
      results.wrongAttempts++;
      comboCount = 0;
      if (word && !results.missed.includes(word)) results.missed.push(word);
      tile.classList.add('wrong');
      shakeTile(tile);
      showFeedback(false);
      if (label) {
        shakeLabel(label);
        setTimeout(() => tile.classList.remove('wrong'), 600);
      }
    }
  }

  function showFeedback(correct) {
    const el = document.getElementById('dd-fb');
    if (!el) return;
    el.textContent = correct
      ? CORRECT_MSGS[Math.floor(Math.random() * CORRECT_MSGS.length)]
      : WRONG_MSGS[Math.floor(Math.random() * WRONG_MSGS.length)];
    el.className = 'feedback-msg show ' + (correct ? 'correct-msg' : 'wrong-msg');
    setTimeout(() => { if (el) el.classList.remove('show'); }, 1000);
  }

  function bounceTile(el) {
    el.classList.remove('anim-bounce');
    void el.offsetWidth;
    el.classList.add('anim-bounce');
  }
  function shakeTile(el) {
    el.classList.remove('anim-shake');
    void el.offsetWidth;
    el.classList.add('anim-shake');
  }
  function shakeLabel(el) {
    el.classList.remove('anim-shake');
    void el.offsetWidth;
    el.classList.add('anim-shake');
  }

  renderBatch();
}
