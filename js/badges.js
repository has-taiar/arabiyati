// badges.js — badge definitions and unlock logic

const BADGE_DEFS = [
  {
    id: 'first_word',
    emoji: '🌟',
    en: 'First Word!',
    ar: 'أول كلمة!',
    hint: 'Answer your first question correctly',
    check: (p) => p.totalCorrect >= 1,
  },
  {
    id: 'numbers_master',
    emoji: '🔢',
    en: 'Number Star',
    ar: 'نجم الأرقام',
    hint: 'Complete NUMBERS with ≥ 80%',
    check: (p) => {
      const cp = p.categoryProgress['NUMBERS'];
      return cp && cp.seen >= 5 && cp.correct / cp.seen >= 0.8;
    },
  },
  {
    id: 'colour_wizard',
    emoji: '🎨',
    en: 'Colour Wizard',
    ar: 'ساحر الألوان',
    hint: 'Complete COLOURS with ≥ 80%',
    check: (p) => {
      const cp = p.categoryProgress['COLOURS'];
      return cp && cp.seen >= 5 && cp.correct / cp.seen >= 0.8;
    },
  },
  {
    id: 'foodie',
    emoji: '🍎',
    en: 'Foodie',
    ar: 'شاطر الأكل',
    hint: 'Complete FOOD with ≥ 80%',
    check: (p) => {
      const cp = p.categoryProgress['FOOD'];
      return cp && cp.seen >= 8 && cp.correct / cp.seen >= 0.8;
    },
  },
  {
    id: 'animal_expert',
    emoji: '🐾',
    en: 'Animal Expert',
    ar: 'خبير الحيوانات',
    hint: 'Complete ANIMALS with 100%',
    check: (p) => {
      const cp = p.categoryProgress['ANIMALS'];
      return cp && cp.seen >= 10 && cp.correct === cp.seen;
    },
  },
  {
    id: 'family_bonds',
    emoji: '👨‍👩‍👧',
    en: 'Family Bonds',
    ar: 'روابط العائلة',
    hint: 'Complete FAMILY with ≥ 80%',
    check: (p) => {
      const cp = p.categoryProgress['FAMILY'];
      return cp && cp.seen >= 5 && cp.correct / cp.seen >= 0.8;
    },
  },
  {
    id: 'streak_3',
    emoji: '🔥',
    en: '3-Day Streak',
    ar: 'ثلاثة أيام متتالية',
    hint: 'Play 3 days in a row',
    check: (p) => p.streak >= 3,
  },
  {
    id: 'streak_7',
    emoji: '🔥🔥',
    en: 'Week Warrior',
    ar: 'محارب الأسبوع',
    hint: 'Play 7 days in a row',
    check: (p) => p.streak >= 7,
  },
  {
    id: 'arabic_star',
    emoji: '🏆',
    en: 'Arabic Star',
    ar: 'نجم العربية',
    hint: 'Answer 100 questions correctly',
    check: (p) => p.totalCorrect >= 100,
  },
  {
    id: 'perfect_round',
    emoji: '💯',
    en: 'Perfect Round',
    ar: 'جولة مثالية',
    hint: 'Complete any round with 100%',
    check: (p) => p._lastRoundPerfect === true,
  },
  {
    id: 'explorer',
    emoji: '🗺️',
    en: 'Explorer',
    ar: 'مستكشف',
    hint: 'Play all categories at least once',
    check: (p) => {
      const played = Object.keys(p.categoryProgress).filter(cat => (p.categoryProgress[cat].seen || 0) > 0);
      return played.length >= Object.keys(CATEGORY_META).length;
    },
  },
  {
    id: 'century',
    emoji: '💫',
    en: '100 Stars',
    ar: '١٠٠ نجمة',
    hint: 'Collect 100 stars',
    check: (p) => p.totalStars >= 100,
  },
];

// Returns array of newly unlocked badge ids
function checkBadges(profile) {
  const newBadges = [];
  for (const def of BADGE_DEFS) {
    if (!profile.badges.includes(def.id) && def.check(profile)) {
      profile.badges.push(def.id);
      newBadges.push(def.id);
    }
  }
  return newBadges;
}

function getBadgeDef(id) {
  return BADGE_DEFS.find(b => b.id === id);
}
