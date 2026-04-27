// games/connectColumns.js

function mountConnectColumns(container, { words, onComplete, onStar, onCombo }) {
  // Use up to 6 words per round
  const roundWords = words.slice(0, 6);
  const results = { correct: 0, total: roundWords.length, missed: [], wrongPairs: 0 };
  let comboCount = 0;
  let selectedArabic = null;
  let selectedEnglish = null;
  let matchedIds = new Set();
  let startTime = Date.now();

  const englishShuffled = shuffle([...roundWords]);

  function render() {
    container.innerHTML = `
      <div style="text-align:center;margin-bottom:10px;font-size:0.85rem;color:#777;">
        Match the Arabic word to its English meaning<br>
        <span style="font-family:var(--font-ar)">طابق الكلمة العربية مع معناها بالإنجليزي</span><br>
        <span style="font-size:0.78rem;color:var(--teal);">🔊 Tap any Arabic word to hear it · اضغط على الكلمة لتسمعها</span>
      </div>
      <div class="connect-columns" id="cc-grid"></div>
      <div class="feedback-msg" id="cc-fb"></div>
    `;

    const grid = document.getElementById('cc-grid');

    // Left column: Arabic, Right column: English (shuffled)
    for (let i = 0; i < roundWords.length; i++) {
      const arBtn = document.createElement('button');
      arBtn.className = 'col-item arabic-item';
      arBtn.dataset.id = roundWords[i].id;
      arBtn.dataset.col = 'arabic';
      // Show Arabic text + small speaker icon
      arBtn.innerHTML = `${roundWords[i].arabic} <span class="speak-btn-sm">🔊</span>`;
      arBtn.addEventListener('click', () => handleClick(arBtn, 'arabic'));
      // Speak on tap
      arBtn.querySelector('.speak-btn-sm').addEventListener('click', (e) => {
        e.stopPropagation();
        Speech.speakWord(roundWords[i]);
      });
      grid.appendChild(arBtn);

      const enBtn = document.createElement('button');
      enBtn.className = 'col-item';
      enBtn.textContent = englishShuffled[i].english;
      enBtn.dataset.id = englishShuffled[i].id;
      enBtn.dataset.col = 'english';
      enBtn.addEventListener('click', () => handleClick(enBtn, 'english'));
      grid.appendChild(enBtn);
    }
  }

  function handleClick(btn, col) {
    if (btn.classList.contains('matched') || btn.disabled) return;

    if (col === 'arabic') {
      // deselect previous arabic
      document.querySelectorAll('.col-item[data-col="arabic"].selected').forEach(b => b.classList.remove('selected'));
      selectedArabic = btn;
      btn.classList.add('selected');
    } else {
      document.querySelectorAll('.col-item[data-col="english"].selected').forEach(b => b.classList.remove('selected'));
      selectedEnglish = btn;
      btn.classList.add('selected');
    }

    if (selectedArabic && selectedEnglish) {
      checkPair();
    }
  }

  function checkPair() {
    const arId = parseInt(selectedArabic.dataset.id);
    const enId = parseInt(selectedEnglish.dataset.id);

    if (arId === enId) {
      // Correct!
      selectedArabic.classList.remove('selected');
      selectedArabic.classList.add('matched');
      selectedArabic.disabled = true;
      selectedEnglish.classList.remove('selected');
      selectedEnglish.classList.add('matched');
      selectedEnglish.disabled = true;
      matchedIds.add(arId);
      results.correct++;
      comboCount++;
      onStar && onStar(1);
      if (comboCount === 3) onCombo && onCombo(3);
      showFeedback(true);
      sparkleEl(selectedArabic);
      selectedArabic = null;
      selectedEnglish = null;

      if (matchedIds.size === roundWords.length) {
        // All matched!
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed < 30) onStar && onStar(2); // speed bonus
        else if (elapsed < 60) onStar && onStar(1);
        setTimeout(() => onComplete(results), 700);
      }
    } else {
      // Wrong
      results.wrongPairs++;
      comboCount = 0;
      const word = roundWords.find(w => w.id === arId);
      if (word && !results.missed.includes(word)) results.missed.push(word);
      selectedArabic.classList.add('wrong');
      selectedEnglish.classList.add('wrong');
      showFeedback(false);
      shakeEl(selectedArabic);
      shakeEl(selectedEnglish);
      setTimeout(() => {
        selectedArabic.classList.remove('selected', 'wrong');
        selectedEnglish.classList.remove('selected', 'wrong');
        selectedArabic = null;
        selectedEnglish = null;
      }, 600);
    }
  }

  function showFeedback(correct) {
    const el = document.getElementById('cc-fb');
    if (!el) return;
    el.textContent = correct
      ? CORRECT_MSGS[Math.floor(Math.random() * CORRECT_MSGS.length)]
      : WRONG_MSGS[Math.floor(Math.random() * WRONG_MSGS.length)];
    el.className = 'feedback-msg show ' + (correct ? 'correct-msg' : 'wrong-msg');
    setTimeout(() => { if (el) el.classList.remove('show'); }, 1000);
  }

  render();
}

function shakeEl(el) {
  el.classList.remove('anim-shake');
  void el.offsetWidth;
  el.classList.add('anim-shake');
}

function sparkleEl(el) {
  const sparks = ['⭐','✨','🌟'];
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = sparks[i % sparks.length];
    const angle = i * 120;
    const r = 30;
    const x = Math.cos((angle * Math.PI) / 180) * r;
    const y = Math.sin((angle * Math.PI) / 180) * r;
    s.style.setProperty('--spark-end', `translate(${x}px,${y}px)`);
    s.style.left = '50%'; s.style.top = '50%';
    el.style.position = 'relative';
    el.appendChild(s);
    setTimeout(() => s.remove(), 800);
  }
}
