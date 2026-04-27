// app.js — bootstrap and screen orchestration

const AVATARS = ['🧑‍🚀','🤖','🐱','🐲','🦊','🐸','🦄','🐼'];
const OFFLINE_OPT_KEY = 'arabiyati_offline_opt';

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

  await bootRoute();
});

async function bootRoute() {
  // 1. Magic-link callback first (sets JWT and strips URL)
  if (typeof Sync !== 'undefined') {
    try { await Sync.handleAuthCallback(); } catch (e) {}
  }

  // 2. Signed in → consult cloud profiles
  if (typeof Sync !== 'undefined' && Sync.isSignedIn()) {
    let remotes = null;
    try { remotes = await Sync.listProfiles(); } catch (e) {}

    if (remotes && remotes.length === 0) {
      // No child profiles yet — onboarding to create first
      profile = null;
      showScreen('onboarding');
      return;
    }

    if (remotes && remotes.length >= 1) {
      // Pick active profile: existing link, or only one, or ask
      const activeId = Sync.getProfileId();
      const stillExists = activeId && remotes.some(r => r.id === activeId);
      if (!stillExists) Sync.setProfileId(null);

      if (remotes.length === 1) {
        Sync.setProfileId(remotes[0].id);
        await Sync.pullToLocal();
      } else if (!Sync.getProfileId()) {
        showScreen('profilePicker', { profiles: remotes });
        return;
      } else {
        // Already have an active; refresh in background
        Sync.pullToLocal().catch(() => {});
      }
    }
    // Either remotes==null (offline) or we have an active id — fall through to home
  }

  // 3. Not signed in: first-time visitor → signin screen (unless they opted offline)
  profile = loadProfile();
  const offlineOpted = localStorage.getItem(OFFLINE_OPT_KEY) === '1';
  const apiAvailable = typeof Sync !== 'undefined' && Sync.isConfigured();
  const noLocalProfile = !profile || !profile.name;

  if (apiAvailable && !offlineOpted && !((typeof Sync !== 'undefined') && Sync.isSignedIn()) && noLocalProfile) {
    showScreen('signin');
    return;
  }

  // 4. Continue normally
  profile = loadProfile();
  if (!profile || !profile.name) {
    showScreen('onboarding');
  } else {
    updateStreak(profile);
    saveProfile(profile);
    showScreen('home');
  }
}

// ── SCREEN: SIGN IN (first-time visit, parent enters email) ──────────────────
registerScreen('signin', (app) => {
  app.innerHTML = `
    <div class="onboarding-screen">
      <div class="logo anim-bounce-in">عربيتي</div>
      <div class="logo-sub">Arabiyati · My Arabic</div>
      <p style="color:#555;max-width:340px;margin:8px auto 18px;font-size:0.95rem;line-height:1.45;">
        Welcome! Enter your email to get a secure sign-in link.<br>
        <span style="color:#777;font-size:0.85rem;">No password. Works across all your devices.</span>
      </p>
      <input type="email" class="text-input" id="signin-email" placeholder="parent@email.com"
             style="max-width:300px;margin-bottom:12px;" autocomplete="email" inputmode="email" />
      <button class="btn btn-primary" id="signin-btn" style="max-width:300px;">
        Send sign-in link · أرسل الرابط
      </button>
      <div id="signin-msg" style="font-size:0.9rem;color:var(--teal-dk);margin-top:12px;min-height:1.2em;max-width:320px;"></div>
      <button class="link-btn" id="offline-btn" style="margin-top:24px;">
        Or continue offline (no sync) · استخدم بدون اتصال
      </button>
      <p style="color:#999;font-size:0.78rem;margin-top:6px;max-width:320px;line-height:1.4;">
        You can add an email later from the grown-up area to enable cross-device sync.
      </p>
    </div>
  `;

  const emailInput = document.getElementById('signin-email');
  const sendBtn = document.getElementById('signin-btn');
  const msg = document.getElementById('signin-msg');

  async function send() {
    const email = (emailInput.value || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.style.color = 'var(--coral)';
      msg.textContent = 'Please enter a valid email';
      emailInput.focus();
      return;
    }
    sendBtn.disabled = true;
    msg.style.color = 'var(--teal-dk)';
    msg.textContent = 'Sending…';
    try {
      await Sync.requestMagicLink(email);
      msg.innerHTML = `✓ Link sent to <b>${email}</b>.<br>Open the email on this device and tap the link.`;
      sendBtn.textContent = 'Resend';
      sendBtn.disabled = false;
    } catch (e) {
      msg.style.color = 'var(--coral)';
      msg.textContent = 'Could not send: ' + e.message;
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', send);
  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

  document.getElementById('offline-btn').addEventListener('click', () => {
    localStorage.setItem(OFFLINE_OPT_KEY, '1');
    showScreen('onboarding');
  });
});

// ── SCREEN: PROFILE PICKER (signed-in, multiple kids) ─────────────────────────
registerScreen('profilePicker', (app, { profiles }) => {
  app.innerHTML = `
    <div class="onboarding-screen">
      <div class="logo anim-bounce-in" style="font-size:2.6rem;">عربيتي</div>
      <div class="logo-sub" style="font-size:1.05rem;">Who's playing? · من يلعب؟</div>
      <div class="profile-picker-grid" id="picker-grid"></div>
      <button class="btn btn-secondary" id="add-child-btn" style="max-width:300px;margin-top:16px;">
        ➕ Add child · أضف طفلاً
      </button>
    </div>
  `;
  const grid = document.getElementById('picker-grid');
  profiles.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'picker-card';
    btn.innerHTML = `
      <span class="picker-avatar">${AVATARS[(p.avatar || 1) - 1]}</span>
      <span class="picker-name">${p.name || '—'}</span>
    `;
    btn.addEventListener('click', async () => {
      Sync.setProfileId(p.id);
      btn.classList.add('loading');
      await Sync.pullToLocal();
      profile = loadProfile();
      updateStreak(profile);
      saveProfile(profile);
      showScreen('home');
    });
    grid.appendChild(btn);
  });
  document.getElementById('add-child-btn').addEventListener('click', () => {
    Sync.setProfileId(null);
    profile = null;
    showScreen('onboarding');
  });
});
registerScreen('onboarding', (app) => {
  let selectedAvatar = 1;
  const signedIn = (typeof Sync !== 'undefined' && Sync.isSignedIn());
  const heading = signedIn
    ? `Create a child profile · أضف ملف الطفل`
    : `Pick your avatar · اختر صورتك`;
  const namePrompt = signedIn ? `Child's name · اسم الطفل` : `What's your name? · ما اسمك؟`;
  const namePlaceholder = signedIn ? 'Child name…' : 'Enter your name…';

  app.innerHTML = `
    <div class="onboarding-screen">
      <div class="logo anim-bounce-in">عربيتي</div>
      <div class="logo-sub">Arabiyati · My Arabic</div>
      <p style="color:#555;margin-bottom:16px;font-size:0.95rem;">${heading}</p>
      <div class="avatar-picker" id="avatar-picker"></div>
      <p style="color:#555;margin-bottom:8px;font-size:0.95rem;">${namePrompt}</p>
      <input class="text-input" id="name-input" placeholder="${namePlaceholder}" maxlength="24"
             style="max-width:300px;margin-bottom:20px;" />
      <button class="btn btn-primary" id="start-btn" style="max-width:300px;">
        Let's go! · يلا! 🚀
      </button>
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

  document.getElementById('start-btn').addEventListener('click', async () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) {
      document.getElementById('name-input').focus();
      document.getElementById('name-input').style.borderColor = 'var(--coral)';
      return;
    }
    profile = createProfile(name, selectedAvatar);
    updateStreak(profile);

    // If signed in and no remote profile yet, create one silently
    if (typeof Sync !== 'undefined' && Sync.isSignedIn() && !Sync.getProfileId()) {
      try {
        const id = await Sync.createRemoteProfile(name, selectedAvatar);
        Sync.setProfileId(id);
      } catch (e) { /* offline / failure: keep local only */ }
    }

    saveProfile(profile);
    showScreen('home');
  });
});

// ── SCREEN: HOME ──────────────────────────────────────────────────────────────
registerScreen('home', (app) => {
  const modes = [
    { id: 'flashcard',      icon: '🃏', en: 'Flash Cards',     ar: 'البطاقات' },
    { id: 'multipleChoice', icon: '🔤', en: 'Multiple Choice', ar: 'اختيار' },
    { id: 'connectColumns', icon: '🔗', en: 'Connect',         ar: 'وصّل' },
    { id: 'dragDrop',       icon: '🧲', en: 'Drag & Drop',     ar: 'اسحب' },
    { id: 'challengeMix',   icon: '🔀', en: 'Challenge',       ar: 'تحدي' },
  ];

  app.innerHTML = `
    ${topBar()}
    <div class="home-screen">
      <h2 class="home-section-title">⚡ Quick Play · لعب سريع</h2>
      <p class="home-section-sub">${WORDS.length} words from all categories — tap a game to start</p>
      <div class="game-mode-grid" id="qp-grid"></div>

      <h2 class="home-section-title" style="margin-top:24px;">📚 Categories · الفئات</h2>
      <p class="home-section-sub">Pick a topic to focus on</p>
      <div class="category-grid" id="cat-grid"></div>
    </div>
  `;

  wireTopBar();

  const qpGrid = document.getElementById('qp-grid');
  modes.forEach(mode => {
    const btn = document.createElement('button');
    btn.className = 'game-mode-card';
    btn.innerHTML = `
      <span class="game-mode-icon">${mode.icon}</span>
      <span class="game-mode-en">${mode.en}</span>
      <span class="game-mode-ar arabic">${mode.ar}</span>
    `;
    btn.addEventListener('click', () => {
      const gameWords = shuffle([...WORDS]).slice(0, 20);
      showScreen('game', {
        words: gameWords,
        mode: mode.id,
        categoryKey: '__quick__',
        label: `⚡ Quick Play · لعب سريع`,
      });
    });
    qpGrid.appendChild(btn);
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
      <div class="profile-header">
        <span class="profile-avatar">${AVATARS[(profile.avatar || 1) - 1]}</span>
        <div>
          <div class="profile-name">${profile.name}</div>
          <div class="profile-sub">Days played: ${profile.daysPlayed || 0}</div>
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

      <div class="grownup-card" id="grownup-card">
        <div class="grownup-locked" id="grownup-locked">
          <span class="grownup-icon">🔒</span>
          <div>
            <div class="grownup-title">Grown-up area · للكبار</div>
            <div class="grownup-sub">Sign out · switch profile · cloud sync</div>
          </div>
          <span class="grownup-tap">Tap →</span>
        </div>
        <div class="grownup-unlocked" id="grownup-unlocked" style="display:none;"></div>
      </div>
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

  document.getElementById('grownup-locked').addEventListener('click', () => {
    askMathGate(() => {
      document.getElementById('grownup-locked').style.display = 'none';
      const u = document.getElementById('grownup-unlocked');
      u.style.display = 'block';
      renderGrownupArea(u);
    });
  });
});

// ── Math gate (parental gate) ─────────────────────────────────────────────────
function askMathGate(onSuccess) {
  // pick two numbers 2..9
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 2 + Math.floor(Math.random() * 8);
  const answer = a + b;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">🔒 Grown-up check</div>
      <div class="modal-q">What is <b>${a} + ${b}</b>?</div>
      <input type="tel" inputmode="numeric" class="modal-input" id="math-input" autocomplete="off" />
      <div class="modal-msg" id="math-msg"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="math-cancel">Cancel</button>
        <button class="btn btn-primary" id="math-ok">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#math-input');
  const msg = overlay.querySelector('#math-msg');
  setTimeout(() => input.focus(), 50);

  function close() { overlay.remove(); }
  function check() {
    const v = parseInt((input.value || '').trim(), 10);
    if (v === answer) { close(); onSuccess(); }
    else {
      msg.textContent = 'Hmm, try again.';
      input.value = '';
      input.focus();
    }
  }
  overlay.querySelector('#math-ok').addEventListener('click', check);
  overlay.querySelector('#math-cancel').addEventListener('click', close);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// ── Grown-up area content ─────────────────────────────────────────────────────
async function renderGrownupArea(container) {
  const signedIn = (typeof Sync !== 'undefined' && Sync.isSignedIn());
  const apiAvailable = typeof Sync !== 'undefined' && Sync.isConfigured();

  // Build sections
  let html = `<div class="grownup-header">👨‍👩‍👧 Grown-up area</div>`;

  if (signedIn) {
    html += `
      <div class="gu-row">
        <div class="gu-label">Signed in as</div>
        <div class="gu-value">${Sync.getEmail() || ''}</div>
      </div>
      <div class="gu-row gu-actions">
        <button class="btn btn-secondary gu-btn" id="gu-switch">Switch / add child</button>
        <button class="btn btn-secondary gu-btn gu-danger" id="gu-signout">Sign out</button>
      </div>
    `;
  } else if (apiAvailable) {
    // Offline-only mode → offer add-email
    html += `
      <div class="gu-row">
        <div class="gu-label">Cloud sync</div>
        <div class="gu-value gu-muted">Off (offline only)</div>
      </div>
      <div class="gu-add-email">
        <p class="gu-help">Add an email to back up progress and sync across devices.</p>
        <input type="email" class="text-input" id="gu-email" placeholder="parent@email.com" autocomplete="email" inputmode="email" />
        <button class="btn btn-primary gu-btn" id="gu-send-link">Send sign-in link</button>
        <div class="gu-msg" id="gu-msg"></div>
      </div>
    `;
  }

  html += `
    <div class="gu-divider"></div>
    <button class="btn-danger gu-btn" id="gu-reset">Reset this profile's progress</button>
  `;

  container.innerHTML = html;

  // Wire up actions
  if (signedIn) {
    container.querySelector('#gu-signout').addEventListener('click', () => {
      if (!confirm('Sign out? Cloud sync will stop. Local progress on this device stays.')) return;
      Sync.signOut();
      // Re-route to signin (or onboarding offline)
      bootRoute();
    });

    container.querySelector('#gu-switch').addEventListener('click', async () => {
      let remotes = [];
      try { remotes = await Sync.listProfiles(); } catch (e) {}
      Sync.setProfileId(null);
      profile = null;
      if (remotes.length === 0) showScreen('onboarding');
      else                     showScreen('profilePicker', { profiles: remotes });
    });
  } else if (apiAvailable) {
    const sendBtn = container.querySelector('#gu-send-link');
    const emailInput = container.querySelector('#gu-email');
    const msgEl = container.querySelector('#gu-msg');
    sendBtn.addEventListener('click', async () => {
      const email = (emailInput.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msgEl.style.color = 'var(--coral)';
        msgEl.textContent = 'Please enter a valid email';
        return;
      }
      sendBtn.disabled = true;
      msgEl.style.color = 'var(--teal-dk)';
      msgEl.textContent = 'Sending…';
      try {
        await Sync.requestMagicLink(email);
        // Clear the offline opt-in so future visits go through the standard signed-in path
        localStorage.removeItem(OFFLINE_OPT_KEY);
        msgEl.innerHTML = `✓ Link sent to <b>${email}</b>. Open it on this device to finish sign-in.`;
        sendBtn.textContent = 'Resend';
        sendBtn.disabled = false;
      } catch (e) {
        msgEl.style.color = 'var(--coral)';
        msgEl.textContent = 'Could not send: ' + e.message;
        sendBtn.disabled = false;
      }
    });
  }

  container.querySelector('#gu-reset').addEventListener('click', () => {
    if (!confirm('Reset this profile\'s progress? This cannot be undone.')) return;
    resetProfile();
    profile = null;
    // Also clear remote link so they'll get re-onboarded cleanly
    if (typeof Sync !== 'undefined') Sync.setProfileId(null);
    bootRoute();
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
