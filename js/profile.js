// profile.js — localStorage read/write helpers

const PROFILE_KEY = 'arabiyati_profile';

const DEFAULT_PROFILE = {
  name: '',
  avatar: 1,
  totalStars: 0,
  streak: 0,
  lastPlayed: null,
  badges: [],
  categoryProgress: {},   // { "NUMBERS": { seen: 0, correct: 0, modeUnlocked: 1 } }
  totalCorrect: 0,
  daysPlayed: 0,
  gamesPlayed: 0,
  voice: 'rana',          // 'rana' (female) or 'bassel' (male) — Iraqi Arabic TTS
  // Pronunciation feedback collected from users — keyed "{voice}/{wordId}".
  // Value: { rating: 'up' | 'down', ts: <unix-ms> }. Synced via profile push.
  audioFeedback: {},
};

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return Object.assign({}, DEFAULT_PROFILE, JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('Could not save profile:', e);
  }
  // Push to server (debounced; no-op if offline / not signed in)
  try {
    if (typeof Sync !== 'undefined' && Sync.schedulePush) Sync.schedulePush(profile);
  } catch (e) {}
}

function createProfile(name, avatar) {
  const profile = { ...DEFAULT_PROFILE, name, avatar };
  saveProfile(profile);
  return profile;
}

function resetProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

function getCategoryProgress(profile, cat) {
  return profile.categoryProgress[cat] || { seen: 0, correct: 0, modeUnlocked: 1 };
}

function updateCategoryProgress(profile, cat, { seen = 0, correct = 0 } = {}) {
  const cur = getCategoryProgress(profile, cat);
  cur.seen += seen;
  cur.correct += correct;
  profile.categoryProgress[cat] = cur;
}

// Unlock the next mode for a category if accuracy >= 70%
function tryUnlockNextMode(profile, cat, roundCorrect, roundTotal) {
  const accuracy = roundTotal > 0 ? roundCorrect / roundTotal : 0;
  if (accuracy < 0.7) return false;
  const cur = getCategoryProgress(profile, cat);
  if (cur.modeUnlocked < 5) {
    cur.modeUnlocked += 1;
    profile.categoryProgress[cat] = cur;
    return true;
  }
  return false;
}

function addStars(profile, count) {
  profile.totalStars = (profile.totalStars || 0) + count;
}

// Call once per session start
function updateStreak(profile) {
  const today = new Date().toISOString().slice(0, 10);
  if (profile.lastPlayed === today) return; // already updated today

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (profile.lastPlayed === yesterday) {
    profile.streak = (profile.streak || 0) + 1;
  } else if (profile.lastPlayed !== today) {
    profile.streak = 1;
  }
  profile.lastPlayed = today;
  profile.daysPlayed = (profile.daysPlayed || 0) + 1;
}
