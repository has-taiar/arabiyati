// app.js — bootstrap and screen orchestration

const AVATARS = ['🧑‍🚀','🤖','🐱','🐲','🦊','🐸','🦄','🐼'];

let profile = null;
let comboBanner = null;
let badgeToast = null;

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Inject persistent overlay elements
  comboBanner = document.createElement('div');
  comboBanner.className = 'combo-banner';
  document.body.appendChild(comboBanner);

  badgeToast = document.createElement('div');
  badgeToast.className = 'badge-unlock-toast';
  document.body.appendChild(badgeToast);

  // Cloud sync: handle magic-link callback first, then pull remote if signed in.
  if (typeof Sync !== 'undefined') {
    try { await Sync.handleAuthCallback(); } catch (e) {}
    if (Sync.isSignedIn() && Sync.getProfileId()) {
      try { await Sync.pullToLocal(); } catch (e) {}
    }
  }

  profile = loadProfile();
  if (!profile || !profile.name) {
    showScreen('onboarding');
  } else {
    updateStreak(profile);
    saveProfile(profile);
    showScreen('home');
  }
});

// ── SCREEN: ONBOARDING ────────────────────────────────────────────────────────
registerScreen('onboarding', (app) => {
  let selectedAvatar = 1;
  app.innerHTML = `
    <div class="onboarding-screen">
      <div class="logo anim-bounce-in">عربيتي</div>
      <div class="logo-sub">Arabiyati · My Arabic</div>
      <p style="color:#555;margin-bottom:16px;font-size:0.95rem;">Pick your avatar · اختر صورتك</p>
      <div class="avatar-picker" id="avatar-picker"></div>
      <p style="color:#555;margin-bottom:8px;font-size:0.95rem;">What's your name? · ما اسمك؟</p>
      <input class="text-input" id="name-input" placeholder="Enter your name…" maxlength="24"
             style="max-width:300px;margin-bottom:20px;" />
      <button class="btn btn-primary" id="start-btn" style="max-width:300px;">
        Let's go! · يلا! 🚀
      </button>
      <button class="btn btn-secondary" id="parent-signin-btn" style="max-width:300px;margin-top:14px;font-size:0.9rem;">
        👨‍👩‍👧 Parent sign-in (sync across devices)
      </button>
      <div id="parent-signin-box" style="display:none;max-width:340px;margin:16px auto 0;background:white;border:2px solid var(--teal);border-radius:14px;padding:14px;text-align:left;">
        <div style="font-size:0.85rem;color:#555;margin-bottom:8px;">
          Enter your email and we'll send you a one-tap sign-in link.
        </div>
        <input type="email" id="parent-email" placeholder="parent@email.com"
               style="width:100%;padding:10px;border:2px solid #ddd;border-radius:10px;margin-bottom:8px;font-size:0.95rem;box-sizing:border-box;" />
        <button class="btn" id="parent-send-btn" style="width:100%;">Send sign-in link · أرسل رابط</button>
        <div id="parent-msg" style="font-size:0.85rem;color:#00897B;margin-top:8px;min-height:1em;"></div>
      </div>
    </div>
  `;

  const picker = document.getElementById('avatar-picker');
  AVATARS.forEach((av, i) => {
    const btn = document.createElement('button');
    btn.className = 'avatar-option' + (i === 0 ? ' selected' : '');
    btn.textContent = av;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAvatar = i + 1;
    });
    picker.appendChild(btn);
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) {
      document.getElementById('name-input').focus();
      document.getElementById('name-input').style.borderColor = 'var(--coral)';
      return;
    }
    profile = createProfile(name, selectedAvatar);
    updateStreak(profile);
    saveProfile(profile);
    showScreen('home');
  });

  // Parent sign-in toggle + magic link
  const signinBtn = document.getElementById('parent-signin-btn');
  const signinBox = document.getElementById('parent-signin-box');
  if (typeof Sync === 'undefined' || !Sync.isConfigured()) {
    signinBtn.style.display = 'none';
  } else {
    signinBtn.addEventListener('click', () => {
      const open = signinBox.style.display !== 'none';
      signinBox.style.display = open ? 'none' : 'block';
      if (!open) document.getElementById('parent-email').focus();
    });
    document.getElementById('parent-send-btn').addEventListener('click', async () => {
      const email = (document.getElementById('parent-email').value || '').trim();
      const msg = document.getElementById('parent-msg');
      if (!email) { msg.style.color = 'var(--coral)'; msg.textContent = 'Enter an email'; return; }
      msg.style.color = 'var(--teal-dk)';
      msg.textContent = 'Sending…';
      try {
        await Sync.requestMagicLink(email);
        msg.textContent = '✓ Link sent! Check email and tap the link to sign in.';
      } catch (e) {
        msg.style.color = 'var(--coral)';
        msg.textContent = 'Could not send: ' + e.message;
      }
    });
  }
});

// ── SCREEN: HOME ──────────────────────────────────────────────────────────────
registerScreen('home', (app) => {
  app.innerHTML = `
    ${topBar()}
    <div class="home-screen">
      <button class="quick-play-btn anim-pulse" id="quick-play">
        ⚡ Quick Play · لعب سريع
      </button>
      <h2>Categories · الفئات</h2>
      <div class="category-grid" id="cat-grid"></div>
    </div>
  `;

  wireTopBar();

  document.getElementById('quick-play').addEventListener('click', () => {
    showScreen('quickPlay');
  });

  const grid = document.getElementById('cat-grid');
  CATEGORIES.forEach(cat => {
    const meta = CATEGORY_META[cat] || { en: cat, ar: cat, emoji: '📚', color: '#F5F5F5' };
    const cp = getCategoryProgress(profile, cat);
    const total = getWordsByCategory(cat).length;
    const pct = total > 0 ? Math.round((cp.correct / total) * 100) : 0;
    const card = document.createElement('button');
    card.className = 'cat-card';
    card.style.background = meta.color;
    card.innerHTML = `
      <span class="cat-emoji">${meta.emoji}</span>
      <span class="cat-name-en">${meta.en}</span>
      <span class="cat-name-ar arabic">${meta.ar}</span>
      <div class="progress-ring-wrap">${svgRing(pct)}</div>
    `;
    card.addEventListener('click', () => {
      showScreen('modePicker', {
        words: getWordsByCategory(cat),
        categoryKey: cat,
        label: `${meta.emoji} ${meta.en} · ${meta.ar}`
      });
    });
    grid.appendChild(card);
  });
});

// ── SCREEN: QUICK PLAY PICKER ─────────────────────────────────────────────────
registerScreen('quickPlay', (app) => {
  const modes = [
    { id: 'flashcard',      icon: '🃏', en: 'Flash Cards',        ar: 'البطاقات' },
    { id: 'multipleChoice', icon: '🔤', en: 'Multiple Choice',    ar: 'الاختيار المتعدد' },
    { id: 'connectColumns', icon: '🔗', en: 'Connect the Columns',ar: 'وصّل الأعمدة' },
    { id: 'dragDrop',       icon: '🧲', en: 'Drag & Drop',        ar: 'اسحب وأفلت' },
    { id: 'challengeMix',   icon: '🔀', en: 'Challenge Mix',      ar: 'تحدي مختلط' },
  ];

  app.innerHTML = `
    ${topBar()}
    <div class="mode-picker">
      <button class="btn btn-secondary" id="back-home" style="margin-bottom:14px;">← Back · رجوع</button>
      <h2>⚡ Quick Play · لعب سريع</h2>
      <p class="subtitle">${WORDS.length} words from all categories — all modes unlocked!</p>
      <div class="mode-list" id="qp-mode-list"></div>
    </div>
  `;

  wireTopBar();
  document.getElementById('back-home').addEventListener('click', () => showScreen('home'));

  const list = document.getElementById('qp-mode-list');
  modes.forEach(mode => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    btn.innerHTML = `
      <span class="mode-icon">${mode.icon}</span>
      <span>
        <span class="mode-label-en">${mode.en}</span><br>
        <span class="mode-label-ar arabic">${mode.ar}</span>
      </span>
    `;
    btn.addEventListener('click', () => {
      // Pick a fresh random set of 20 words each time
      const gameWords = shuffle([...WORDS]).slice(0, 20);
      showScreen('game', {
        words: gameWords,
        mode: mode.id,
        categoryKey: '__quick__',
        label: `⚡ Quick Play · لعب سريع`,
      });
    });
    list.appendChild(btn);
  });
});

// ── SCREEN: MODE PICKER ───────────────────────────────────────────────────────
registerScreen('modePicker', (app, { words, categoryKey, label }) => {
  const cp = getCategoryProgress(profile, categoryKey);
  const unlocked = cp.modeUnlocked || 1;

  const modes = [
    { id: 'flashcard',       icon: '🃏', en: 'Flash Cards',       ar: 'البطاقات',       level: 1 },
    { id: 'multipleChoice',  icon: '🔤', en: 'Multiple Choice',   ar: 'الاختيار المتعدد',level: 2 },
    { id: 'connectColumns',  icon: '🔗', en: 'Connect the Columns',ar: 'وصّل الأعمدة',   level: 3 },
    { id: 'dragDrop',        icon: '🧲', en: 'Drag & Drop',       ar: 'اسحب وأفلت',     level: 4 },
    { id: 'challengeMix',    icon: '🔀', en: 'Challenge Mix',     ar: 'تحدي مختلط',     level: 5 },
  ];
  const prevModeNames = ['', 'Flash Cards', 'Multiple Choice', 'Connect the Columns', 'Drag & Drop'];

  app.innerHTML = `
    ${topBar()}
    <div class="mode-picker">
      <button class="btn btn-secondary" id="back-home" style="margin-bottom:14px;">← Back · رجوع</button>
      <h2>${label}</h2>
      <p class="subtitle">${words.length} words · ${words.length} كلمة</p>
      <div class="mode-list" id="mode-list"></div>
    </div>
  `;

  wireTopBar();
  document.getElementById('back-home').addEventListener('click', () => showScreen('home'));

  const list = document.getElementById('mode-list');
  modes.forEach(mode => {
    const isLocked = mode.level > unlocked;
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    btn.disabled = isLocked;
    btn.innerHTML = `
      <span class="mode-icon">${mode.icon}</span>
      <span>
        <span class="mode-label-en">${mode.en}</span><br>
        <span class="mode-label-ar arabic">${mode.ar}</span>
      </span>
      ${isLocked
        ? `<span class="lock-icon" title="Complete ${prevModeNames[mode.level - 1]}">🔒</span>
           <span class="unlock-hint">Complete ${prevModeNames[mode.level - 1]} first</span>`
        : ''}
    `;
    if (!isLocked) {
      btn.addEventListener('click', () => {
        showScreen('game', { words: shuffle([...words]), mode: mode.id, categoryKey, label });
      });
    } else {
      btn.addEventListener('click', () => {
        btn.classList.remove('anim-wiggle');
        void btn.offsetWidth;
        btn.classList.add('anim-wiggle');
      });
    }
    list.appendChild(btn);
  });
});

// ── SCREEN: GAME ──────────────────────────────────────────────────────────────
registerScreen('game', (app, { words, mode, categoryKey, label }) => {
  let starsEarned = 0;
  let comboCount = 0;

  app.innerHTML = `
    ${topBar()}
    <div class="game-screen">
      <div class="progress-bar-wrap"><div class="progress-bar-fill" id="g-prog" style="width:0%"></div></div>
      <div class="score-row">
        <span id="g-score">⭐ 0</span>
        <span>${label}</span>
        <button class="exit-btn" id="g-exit">✕ Exit</button>
      </div>
      <div id="game-mount"></div>
    </div>
  `;

  document.getElementById('g-exit').addEventListener('click', () => {
    if (confirm('Exit this round? Your progress will be saved. · خروج؟')) {
      saveProfile(profile);
      showScreen('home');
    }
  });

  function onStar(count) {
    starsEarned += count;
    addStars(profile, count);
    const el = document.getElementById('g-score');
    if (el) {
      el.textContent = `⭐ ${starsEarned}`;
      el.classList.remove('star-pop');
      void el.offsetWidth;
      el.classList.add('star-pop');
    }
  }

  function onCombo(n) {
    comboCount = n;
    showComboBanner(n);
  }

  function updateProgress(done, total) {
    const bar = document.getElementById('g-prog');
    if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
  }

  const mount = document.getElementById('game-mount');
  const effectiveMode = mode === 'challengeMix' ? pickChallengeMode() : mode;

  function onComplete(results) {
    // Update profile
    profile.totalCorrect = (profile.totalCorrect || 0) + results.correct;
    profile.gamesPlayed = (profile.gamesPlayed || 0) + 1;
    profile._lastRoundPerfect = results.correct === results.total;
    updateCategoryProgress(profile, categoryKey, { seen: results.total, correct: results.correct });
    const unlocked = tryUnlockNextMode(profile, categoryKey, results.correct, results.total);
    const newBadges = checkBadges(profile);
    saveProfile(profile);
    newBadges.forEach((bid, i) => setTimeout(() => showBadgeToast(bid), i * 1500));
    showScreen('results', { results, starsEarned, categoryKey, label, mode, words, modeUnlocked: unlocked });
  }

  const gameWords = words; // all available
  if (effectiveMode === 'flashcard') {
    mountFlashcard(mount, { words: gameWords, onComplete });
  } else if (effectiveMode === 'multipleChoice') {
    let done = 0;
    mountMultipleChoice(mount, {
      words: gameWords,
      onStar,
      onCombo,
      onComplete: (r) => { onComplete(r); }
    });
    // progress tracking via mutation — we patch onStar
    const origOnStar = onStar;
  } else if (effectiveMode === 'connectColumns') {
    mountConnectColumns(mount, { words: gameWords, onStar, onCombo, onComplete });
  } else if (effectiveMode === 'dragDrop') {
    mountDragDrop(mount, { words: gameWords, onStar, onCombo, onComplete });
  }
});

function pickChallengeMode() {
  const modes = ['multipleChoice', 'connectColumns', 'dragDrop'];
  return modes[Math.floor(Math.random() * modes.length)];
}

// ── SCREEN: RESULTS ───────────────────────────────────────────────────────────
registerScreen('results', (app, { results, starsEarned, categoryKey, label, mode, words, modeUnlocked }) => {
  const pct = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
  const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
  const msgs3 = ['واو! Amazing! 🎉', 'رائع! Incredible! 🌟', 'ممتاز جداً! Superb! 🏆'];
  const msgs2 = ['زين! Good job! 😊', 'أحسنت! Well done! 👍'];
  const msgs1 = ['استمر! Keep going! 💪', 'حاول مرة ثانية! Try again soon! 🔄'];
  const msgs0 = ['لا تستسلم! Don\'t give up! 🌈'];
  const msg = stars === 3 ? msgs3[Math.floor(Math.random()*msgs3.length)]
            : stars === 2 ? msgs2[Math.floor(Math.random()*msgs2.length)]
            : stars === 1 ? msgs1[Math.floor(Math.random()*msgs1.length)]
            : msgs0[0];

  const starStr = ['⭐','⭐','⭐'].map((s,i) => `<span class="star-reveal" style="animation-delay:${i*0.15}s">${i < stars ? s : '☆'}</span>`).join('');

  app.innerHTML = `
    ${topBar()}
    <div class="results-screen">
      <div class="star-row">${starStr}</div>
      <h2>${msg}</h2>
      <p class="accuracy">${results.correct} / ${results.total} correct · صحيح · +${starsEarned} ⭐</p>
      ${modeUnlocked ? `<div style="background:#E8F5E9;border-radius:12px;padding:10px 16px;margin:10px 0;font-weight:700;color:var(--green);">🔓 New mode unlocked! · مستوى جديد مفتوح!</div>` : ''}
      ${results.missed.length > 0 ? `
        <div class="section-header">Words to practise · كلمات للتدريب</div>
        <ul class="missed-list">
          ${results.missed.slice(0,6).map(w => `
            <li>
              <span class="m-visual">${w.visual}</span>
              <span class="m-arabic arabic">${w.arabic}</span>
              <span class="m-english">${w.english}</span>
              <span style="color:#aaa;font-size:0.78rem;margin-left:auto;">${w.pronunciation}</span>
            </li>
          `).join('')}
        </ul>` : ''}
      <div class="results-actions">
        <button class="btn btn-primary btn-full" id="r-again">Play Again · العب مرة ثانية 🔄</button>
        <button class="btn btn-secondary btn-full" id="r-modes">Try Another Mode · جرّب وضعاً آخر</button>
        <button class="btn btn-secondary btn-full" id="r-home">Go Home · الرئيسية 🏠</button>
      </div>
    </div>
  `;

  if (pct >= 80) {
    setTimeout(() => {
      if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 },
          colors: ['#00BFA5','#FFD600','#FF6B6B','#42A5F5','#7C4DFF'] });
      }
    }, 400);
  }

  wireTopBar();
  document.getElementById('r-again').addEventListener('click', () =>
    showScreen('game', { words: shuffle([...words]), mode, categoryKey, label }));
  document.getElementById('r-modes').addEventListener('click', () =>
    showScreen('modePicker', { words, categoryKey, label }));
  document.getElementById('r-home').addEventListener('click', () => showScreen('home'));
});

// ── SCREEN: PROFILE ───────────────────────────────────────────────────────────
registerScreen('profile', (app) => {
  app.innerHTML = `
    ${topBar()}
    <div class="profile-screen">
      <button class="btn btn-secondary" id="back-home" style="margin-bottom:14px;">← Back · رجوع</button>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <span style="font-size:3.5rem;">${AVATARS[(profile.avatar || 1) - 1]}</span>
        <div>
          <div style="font-size:1.4rem;font-weight:900;">${profile.name}</div>
          <div style="font-size:0.9rem;color:#777;">Days played: ${profile.daysPlayed || 0}</div>
        </div>
      </div>
      <div class="stat-row">
        <div><div class="stat-val">${profile.totalStars || 0}</div><div class="stat-lbl">⭐ Stars</div></div>
        <div><div class="stat-val">${profile.streak || 0}</div><div class="stat-lbl">🔥 Streak</div></div>
        <div><div class="stat-val">${profile.totalCorrect || 0}</div><div class="stat-lbl">✓ Correct</div></div>
        <div><div class="stat-val">${profile.badges ? profile.badges.length : 0}</div><div class="stat-lbl">🏅 Badges</div></div>
      </div>
      <div class="section-header">Badges · الشارات</div>
      <div class="badge-grid" id="badge-grid"></div>
      <div class="section-header" style="margin-top:28px;">☁️ Cloud Sync · المزامنة</div>
      <div id="sync-section" style="background:white;border-radius:14px;padding:14px;border:2px solid var(--teal);"></div>
      <div class="section-header" style="margin-top:28px;">Danger Zone · منطقة الخطر</div>
      <button class="btn-danger" id="reset-btn">Reset Progress · إعادة التعيين</button>
    </div>
  `;

  document.getElementById('back-home').addEventListener('click', () => showScreen('home'));

  const grid = document.getElementById('badge-grid');
  BADGE_DEFS.forEach(def => {
    const earned = profile.badges && profile.badges.includes(def.id);
    const item = document.createElement('div');
    item.className = 'badge-item' + (earned ? ' anim-fade-in' : ' locked');
    item.title = def.hint;
    item.innerHTML = `<span class="badge-emoji">${def.emoji}</span><div>${def.en}</div><div class="arabic" style="font-size:0.65rem;">${def.ar}</div>`;
    grid.appendChild(item);
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    const age = prompt('How old are you? · كم عمرك؟\n(Adults only / للكبار فقط)');
    if (age === null) return;
    const n = parseInt(age, 10);
    if (isNaN(n) || n < 18) {
      alert('Ask a grown-up to help with this! 😊\nاطلب من شخص كبير المساعدة!');
      return;
    }
    if (confirm('Are you sure? All progress will be lost. · هل أنت متأكد؟ سيتم حذف كل التقدم.')) {
      resetProfile();
      profile = null;
      showScreen('onboarding');
    }
  });

  renderSyncSection();
});

function renderSyncSection() {
  const el = document.getElementById('sync-section');
  if (!el) return;
  if (typeof Sync === 'undefined' || !Sync.isConfigured()) {
    el.innerHTML = `<div style="color:#888;font-size:0.9rem;">Cloud sync is not configured for this site. Progress is stored only on this device.</div>`;
    return;
  }

  if (!Sync.isSignedIn()) {
    el.innerHTML = `
      <div style="font-size:0.9rem;color:#555;margin-bottom:8px;">
        Sign in (parent only) to back up progress and sync across devices.
      </div>
      <input type="email" id="sync-email" placeholder="parent@email.com" style="width:100%;padding:10px;border:2px solid #ddd;border-radius:10px;margin-bottom:8px;font-size:0.95rem;" />
      <button class="btn" id="sync-link-btn" style="width:100%;">Send sign-in link · أرسل رابط تسجيل</button>
      <div id="sync-msg" style="font-size:0.85rem;color:#00897B;margin-top:8px;"></div>
    `;
    document.getElementById('sync-link-btn').addEventListener('click', async () => {
      const email = (document.getElementById('sync-email').value || '').trim();
      const msg = document.getElementById('sync-msg');
      if (!email) { msg.style.color = 'var(--coral)'; msg.textContent = 'Enter an email'; return; }
      msg.style.color = 'var(--teal-dk)';
      msg.textContent = 'Sending…';
      try {
        await Sync.requestMagicLink(email);
        msg.textContent = '✓ Link sent! Check email and tap the link.';
      } catch (e) {
        msg.style.color = 'var(--coral)';
        msg.textContent = 'Could not send: ' + e.message;
      }
    });
    return;
  }

  // Signed in — show profile linking & sign-out
  const email = Sync.getEmail() || '';
  const remoteId = Sync.getProfileId();
  const last = parseInt(localStorage.getItem('arabiyati_last_sync') || '0', 10);
  const lastStr = last ? new Date(last).toLocaleString() : 'never';

  el.innerHTML = `
    <div style="font-size:0.85rem;color:#555;">Signed in as <b>${email}</b></div>
    <div style="font-size:0.8rem;color:#888;margin-bottom:10px;">Last synced: ${lastStr}</div>
    <div id="sync-profile-row" style="margin-bottom:10px;"></div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary" id="sync-now-btn" style="flex:1;">⬆ Sync now</button>
      <button class="btn btn-secondary" id="sync-pull-btn" style="flex:1;">⬇ Pull from cloud</button>
    </div>
    <button class="btn btn-secondary" id="sync-out-btn" style="width:100%;margin-top:8px;color:var(--coral);border-color:var(--coral);">Sign out · تسجيل الخروج</button>
    <div id="sync-msg" style="font-size:0.85rem;color:#00897B;margin-top:8px;"></div>
  `;

  const msg = document.getElementById('sync-msg');
  const setMsg = (text, ok = true) => {
    msg.style.color = ok ? 'var(--teal-dk)' : 'var(--coral)';
    msg.textContent = text;
  };

  // Profile linking row
  const row = document.getElementById('sync-profile-row');
  if (!remoteId) {
    row.innerHTML = `
      <div style="font-size:0.85rem;margin-bottom:6px;">This device's profile is not linked to a cloud profile yet.</div>
      <button class="btn" id="sync-create-btn" style="width:100%;">Create cloud profile for ${profile.name}</button>
    `;
    document.getElementById('sync-create-btn').addEventListener('click', async () => {
      try {
        const id = await Sync.createRemoteProfile(profile.name, profile.avatar);
        Sync.setProfileId(id);
        await Sync.flush(profile);
        setMsg('✓ Cloud profile created and synced.');
        renderSyncSection();
      } catch (e) {
        setMsg('Could not create: ' + e.message, false);
      }
    });
  } else {
    row.innerHTML = `<div style="font-size:0.85rem;color:#555;">Linked profile: <code>${remoteId.slice(0, 8)}…</code></div>`;
  }

  document.getElementById('sync-now-btn').addEventListener('click', async () => {
    setMsg('Syncing…');
    try { await Sync.flush(profile); setMsg('✓ Synced'); renderSyncSection(); }
    catch (e) { setMsg('Failed: ' + e.message, false); }
  });
  document.getElementById('sync-pull-btn').addEventListener('click', async () => {
    if (!confirm('Replace local progress with the cloud copy?')) return;
    setMsg('Pulling…');
    try {
      await Sync.pullToLocal();
      profile = loadProfile();
      setMsg('✓ Pulled from cloud');
      showScreen('profile');
    } catch (e) { setMsg('Failed: ' + e.message, false); }
  });
  document.getElementById('sync-out-btn').addEventListener('click', () => {
    if (!confirm('Sign out? Local progress stays on this device.')) return;
    Sync.signOut();
    renderSyncSection();
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function topBar() {
  const av = AVATARS[(profile.avatar || 1) - 1];
  const muted = Speech.isMuted();
  return `
    <div class="top-bar">
      <span class="avatar-sm" style="font-size:1.8rem;line-height:1;display:flex;align-items:center;justify-content:center;">${av}</span>
      <span class="user-name">${profile.name}</span>
      <span class="stars-badge">⭐ ${profile.totalStars || 0}</span>
      <span class="streak-badge">🔥 ${profile.streak || 0}</span>
      <button class="btn-icon${muted ? ' muted' : ''}" id="nav-sound" title="${muted ? 'Unmute · تشغيل الصوت' : 'Mute · كتم الصوت'}">${muted ? '🔇' : '🔊'}</button>
      <button class="btn-icon" id="nav-profile" title="Profile">👤</button>
    </div>
  `;
}

function wireTopBar() {
  const soundBtn = document.getElementById('nav-sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const nowMuted = Speech.toggleMuted();
      soundBtn.textContent = nowMuted ? '🔇' : '🔊';
      soundBtn.classList.toggle('muted', nowMuted);
      soundBtn.title = nowMuted ? 'Unmute · تشغيل الصوت' : 'Mute · كتم الصوت';
    });
    // Long-press / right-click → show audio diagnostic (helps debug Brave etc.)
    soundBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); showSpeechDiagnostic(); });
    let pressTimer = null;
    soundBtn.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(showSpeechDiagnostic, 800);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      soundBtn.addEventListener(ev, () => { if (pressTimer) clearTimeout(pressTimer); })
    );
  }
  const profBtn = document.getElementById('nav-profile');
  if (profBtn) profBtn.addEventListener('click', () => showScreen('profile'));
}

function showSpeechDiagnostic() {
  const d = Speech.diagnose();
  let msg = '🔊 Audio diagnostic\n\n';
  if (!d.supported) {
    msg += '❌ Web Speech API NOT supported in this browser.\n\n';
    msg += 'Try Chrome, Safari, Edge, or Firefox.\n\n';
    msg += 'Note: Brave often blocks Web Speech API by default.\n';
    msg += 'In Brave, go to brave://settings/privacy and disable\n';
    msg += '"Use Google services for push messaging" OR add this site to allowed sites.';
  } else {
    msg += `Supported: ✅\n`;
    msg += `Audio unlocked: ${d.unlocked ? '✅' : '❌ (tap anywhere first)'}\n`;
    msg += `Muted: ${d.muted ? '🔇 yes' : '🔊 no'}\n`;
    msg += `Total voices: ${d.voiceCount}\n`;
    msg += `Arabic voices found: ${d.arabicVoices.length}\n`;
    if (d.arabicVoices.length) msg += '  • ' + d.arabicVoices.join('\n  • ') + '\n';
    msg += `\nSelected voice: ${d.selectedVoice}\n`;
    if (d.voiceCount === 0) {
      msg += '\n⚠️ No voices loaded. This usually means:\n';
      msg += '  • Brave/Firefox privacy blocking\n';
      msg += '  • OS has no TTS voices installed\n';
    } else if (d.arabicVoices.length === 0) {
      msg += '\n⚠️ No Arabic voice on this device.\n';
      msg += 'Will speak the English phonetic guide instead.\n';
      msg += 'To install Arabic TTS:\n';
      msg += '  • Windows: Settings → Time & Language → Speech → Add voices\n';
      msg += '  • macOS: System Settings → Accessibility → Spoken Content\n';
      msg += '  • Android: Settings → Languages → Text-to-speech\n';
    }
  }
  alert(msg);
}

function showComboBanner(n) {
  comboBanner.textContent = n >= 5 ? `🔥🔥 Combo ×${n}! Amazing!` : `🔥 Combo ×${n}!`;
  comboBanner.classList.remove('show');
  void comboBanner.offsetWidth;
  comboBanner.classList.add('show');
  setTimeout(() => comboBanner.classList.remove('show'), 1800);
}

function showBadgeToast(badgeId) {
  const def = getBadgeDef(badgeId);
  if (!def) return;
  badgeToast.innerHTML = `${def.emoji} Badge unlocked! · شارة جديدة!<br><strong>${def.en} · ${def.ar}</strong>`;
  badgeToast.className = 'badge-unlock-toast show';
  setTimeout(() => {
    badgeToast.classList.remove('show');
    badgeToast.classList.add('hide');
    setTimeout(() => badgeToast.classList.remove('hide'), 500);
  }, 2800);
}

function svgRing(pct) {
  const r = 13, circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return `<svg viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="${r}" fill="none" stroke="#E0E0E0" stroke-width="3"/>
    <circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--teal)" stroke-width="3"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 16 16)" class="progress-ring"/>
    <text x="16" y="20" text-anchor="middle" font-size="9" font-weight="700" fill="var(--navy)">${pct}%</text>
  </svg>`;
}
