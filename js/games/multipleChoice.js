// games/multipleChoice.js

const CORRECT_MSGS = [
  "ممتاز! Excellent! ⭐",
  "زين جداً! Well done! 🌟",
  "أحسنت! Great job! 🎉",
  "رائع! Amazing! 💫",
  "برافو! Bravo! 🏆",
];
const WRONG_MSGS = [
  "حاول مرة ثانية! Try again! 💪",
  "قريب! Almost there! 😊",
  "لا تستسلم! Don't give up! 🌈",
];

function mountMultipleChoice(container, { words, onComplete, onStar, onCombo }) {
  let idx = 0;
  let wrongCount = 0;
  let comboCount = 0;
  const results = { correct: 0, total: words.length, missed: [], firstTry: 0 };
  let firstTryFlag = true;

  function renderQuestion() {
    const w = words[idx];
    const distractors = getDistractors(w, 3);
    const options = shuffle([w, ...distractors]);
    firstTryFlag = true;
    wrongCount = 0;
    Speech.cancel();

    container.innerHTML = `
      <div class="mc-question-card anim-fade-in">
        <span class="mc-visual">${w.visual}</span>
        <span class="mc-arabic arabic">${w.arabic}</span>
        <div class="mc-speak-row">
          <div class="say-it-prompt" id="mc-say-it"></div>
          <button class="speak-btn" id="mc-speak" title="Hear it · اسمع">🔊</button>
          <button class="speak-btn" id="mc-mic" title="Listen to yourself · اسمع نفسك" style="border-color:var(--coral);color:var(--coral);">🎤</button>
        </div>
        <span class="mc-pronunc" id="pronunc-hint" style="opacity:0;">${w.pronunciation}</span>
      </div>
      <div class="mc-progress-text" style="text-align:center;font-size:0.8rem;color:#888;margin:6px 0;">
        ${idx + 1} / ${words.length}
      </div>
      <div class="mc-options" id="mc-options"></div>
      <div class="feedback-msg" id="fb-msg"></div>
    `;

    // Speech: "Say it" prompt → auto-speak after 2.5s
    Speech.scheduleSpeak(w, { promptEl: document.getElementById('mc-say-it'), delay: 2500 });
    document.getElementById('mc-speak').addEventListener('click', () => Speech.speakWord(w));

    // Mic / echo-back button
    const micBtn = document.getElementById('mc-mic');
    if (!Speech.micSupported || !Speech.micSupported()) {
      micBtn.style.display = 'none';
    } else {
      micBtn.addEventListener('click', () => {
        const original = micBtn.textContent;
        Speech.recordAndPlayback({
          onState: ({ state }) => {
            if (state === 'recording') { micBtn.textContent = '🔴'; micBtn.disabled = true; }
            else if (state === 'playing') { micBtn.textContent = '👂'; }
            else { micBtn.textContent = original; micBtn.disabled = false; }
          }
        });
      });
    }

    const optContainer = document.getElementById('mc-options');
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'mc-option';
      btn.textContent = opt.english;
      btn.dataset.id = opt.id;
      btn.addEventListener('click', () => handleAnswer(opt, w, btn));
      optContainer.appendChild(btn);
    });
  }

  function handleAnswer(chosen, correct, btn) {
    const allBtns = document.querySelectorAll('.mc-option');
    if (chosen.id === correct.id) {
      btn.classList.add('correct');
      allBtns.forEach(b => b.disabled = true);
      showFeedback(true);
      comboCount++;

      // Always count an eventually-correct answer as "correct" so the kid
      // sees their progress increase. Track first-try separately for star
      // rewards and accuracy/unlock thresholds.
      results.correct++;
      if (firstTryFlag) {
        results.firstTry++;
        onStar && onStar(wrongCount === 0 ? 2 : 1);
      } else {
        onStar && onStar(1);
        if (!results.missed.includes(correct)) results.missed.push(correct);
      }

      if (comboCount === 3) { onCombo && onCombo(3); }
      if (comboCount === 5) { onCombo && onCombo(5); onStar && onStar(2); }

      sparkle(btn);
      setTimeout(() => {
        Speech.cancel();
        idx++;
        if (idx < words.length) renderQuestion();
        else onComplete(results);
      }, 1200);

    } else {
      firstTryFlag = false;
      wrongCount++;
      comboCount = 0;
      btn.classList.add('wrong');
      btn.disabled = true;
      showFeedback(false);
      triggerShake(btn);

      if (wrongCount >= 3) {
        document.getElementById('pronunc-hint').style.opacity = '1';
      }
    }
  }

  function showFeedback(correct) {
    const el = document.getElementById('fb-msg');
    if (!el) return;
    el.textContent = correct
      ? CORRECT_MSGS[Math.floor(Math.random() * CORRECT_MSGS.length)]
      : WRONG_MSGS[Math.floor(Math.random() * WRONG_MSGS.length)];
    el.className = 'feedback-msg show ' + (correct ? 'correct-msg' : 'wrong-msg');
    if (correct) setTimeout(() => { if(el) el.classList.remove('show'); }, 1000);
  }

  renderQuestion();
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function triggerShake(el) {
  el.classList.remove('anim-shake');
  void el.offsetWidth;
  el.classList.add('anim-shake');
}

function sparkle(el) {
  const sparks = ['⭐','✨','🌟','💫'];
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = sparks[i % sparks.length];
    const angle = (i / 5) * 360;
    const r = 45 + Math.random() * 20;
    const x = Math.cos((angle * Math.PI) / 180) * r;
    const y = Math.sin((angle * Math.PI) / 180) * r;
    s.style.setProperty('--spark-end', `translate(${x}px, ${y}px)`);
    s.style.left = '50%';
    s.style.top = '50%';
    el.style.position = 'relative';
    el.appendChild(s);
    setTimeout(() => s.remove(), 800);
  }
}
