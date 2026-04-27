# Arabic Flash Cards — App Specification

**Working title:** عربيتي · Arabiyati ("My Arabic")  
**Target audience:** Children aged 4–10  
**Format:** Static web app, zero backend, hostable on GitHub Pages / Netlify / any CDN  
**Reviewed:** _v2 — awaiting final build approval_

---

## 1. Overview

A colourful, animated Arabic vocabulary game that uses the 178-word word list across 20 categories. Kids learn by playing; every interaction rewards curiosity and gently corrects mistakes. A local profile tracks progress, points, and badges — no login, no server, just the device.

---

## 2. Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Language | Vanilla HTML5 + CSS3 + ES6 JS | Zero build step, runs anywhere |
| Data | `word-list.csv` → embedded JS array at build time | No fetch needed offline |
| Primary storage | `localStorage` | Profile, progress, badges (instant, offline) |
| Cloud sync | Azure Table Storage REST API + SAS token | Cross-device backup, no backend required |
| Fonts | Google Fonts CDN: **Nunito** (UI) + **Amiri** (Arabic) | Kid-friendly, RTL-ready |
| Animations | Pure CSS keyframes + small JS triggers | No library dependency |
| Confetti | [`canvas-confetti`](https://www.npmjs.com/package/canvas-confetti) via CDN | Lightweight, self-contained |
| Icons | Emoji (already in data) + inline SVG for UI chrome | No icon font needed |

No frameworks. No Node.js required to run. A single `index.html` + `app.js` + `styles.css` (split into sensible files for authoring, then kept flat for portability).

---

## 3. Word Data Model

```
{
  id: 1,
  arabic: "واحد",
  pronunciation: "waa-hid",
  english: "One",
  visual: "1️⃣",
  category: "NUMBERS"
}
```

All 178 words loaded as a JS constant at startup. FOOD and FOOD & DRINK are merged into a single **FOOD** category. Final categories:

> NUMBERS · COLOURS · FOOD · ACTIONS · MY ACTIONS · FEELINGS · DESCRIPTIONS · PLACES & THINGS · TIME · USEFUL · GREETINGS · PLACES · WEATHER · NATURE · FAMILY · BODY · ANIMALS · HOME & CLOTHES · QUESTIONS

---

## 4. User Profile (localStorage)

```json
{
  "name": "Layla",
  "avatar": 3,
  "totalStars": 142,
  "streak": 5,
  "badges": ["first_word", "numbers_master", "week_streak"],
  "categoryProgress": {
    "NUMBERS": { "seen": 10, "correct": 9 },
    ...
  },
  "lastPlayed": "2026-04-27"
}
```

On first visit → **onboarding screen** to enter name + pick avatar (8 kid-friendly cartoon avatars: astronaut, robot, cat, dragon, etc.).

---

## 5. Screens & Navigation Flow

```
[ Splash / Onboarding ]
        ↓
[ Home Dashboard ]
  ├── My Profile & Badges
  ├── [ Category Picker ] → [ Mode Picker ] → [ Game ] → [ Results ]
  └── [ Quick Play (random) ]
```

### 5.1 Splash / Onboarding
- Animated logo (bouncing Arabic letters)
- If no profile: pick name + avatar, then → Home
- If profile exists: greet by name, show streak, → Home

### 5.2 Home Dashboard
- Top bar: avatar + name + ⭐ total stars + 🔥 streak
- Grid of **category cards** (emoji + name + progress ring showing % mastered)
- Footer: `Quick Play` button (random mix of all categories)

### 5.3 Mode Picker
After selecting a category, modes are **unlocked progressively** as the kid demonstrates mastery — each mode must be completed at ≥ 70% accuracy to unlock the next:

| Level | Mode | Description | Unlocks after |
|---|---|---|---|
| 1 | 🃏 Flash Cards | Swipe through cards; tap to flip | Always available |
| 2 | 🔤 Multiple Choice | See Arabic word + emoji, pick English from 4 options | Flash Cards ≥ 70% |
| 3 | 🔗 Connect the Columns | Match 6 Arabic words to 6 English words | Multiple Choice ≥ 70% |
| 4 | 🧲 Drag & Drop | Drag Arabic label onto the correct emoji tile | Connect the Columns ≥ 70% |
| 5 | 🔀 Challenge Mix | Random mix of all modes (boss level) | Drag & Drop ≥ 70% |

Locked modes show a padlock icon and a hint: "Complete [previous mode] to unlock!"

### 5.4 Game Screens

Each game round draws **all available items** from the selected category (or a random batch of 15 if Quick Play). If a category has fewer than 4 words, it is padded with randoms from related categories. Rounds can be replayed.

**Game chrome (shared):**
- Animated progress bar at top (stars collected / total questions)
- Current score badge (top right)
- "Exit" button (returns to Home with partial save)

### 5.5 Results Screen
- Star rating: 0–3 stars based on accuracy
- Animated star burst + confetti on ≥ 80%
- "Words to practise" list (missed items, shown as flash cards)
- Earned badges (if any unlocked this round)
- Buttons: `Play Again` | `Try Another Mode` | `Go Home`

### 5.6 Profile & Badges Screen
- Avatar + name (editable)
- Total stars, current streak, days played
- Badge cabinet (locked badges shown greyed with hint)
- **Reset progress** button: prompts "How old are you?". If age ≥ 18 → confirmation dialog → reset. If < 18 → "Ask a grown-up to help with this! 😊"
- **Cloud sync status**: last-synced timestamp + manual "Sync now" button

---

## 6. Game Mode Details

### 6.1 Flash Cards
1. Card shows **emoji** (large, centre)
2. Tap → flips to show **Arabic word** (large, RTL) + pronunciation guide below
3. English appears beneath pronunciation
4. Navigation: `← Prev` `Next →` + swipe gesture
5. "I knew it ✓" / "Still learning ✗" self-report buttons → feeds into progress

### 6.2 Multiple Choice
1. Question card shows **Arabic word** large + emoji + pronunciation
2. 4 answer tiles (English), one correct, three distractors (same category where possible)
3. Kid taps an answer tile
4. Feedback (see §7)
5. Auto-advances after 1.5 s on correct, stays on wrong until correct chosen

### 6.3 Connect the Columns
1. Left column: 6 Arabic words (buttons)
2. Right column: 6 shuffled English words (buttons)
3. Kid taps one from each side to draw a line connecting them
4. Correct pair: line turns green, pair locks
5. Wrong pair: line shakes red, both deselect
6. Complete all 6 → celebration + score
7. Timed bonus: finish under 60 s = extra ⭐

### 6.4 Drag & Drop
1. Row of 4–6 large **emoji tiles** (answers)
2. Arabic word labels appear one at a time at top
3. Kid drags label onto the correct emoji tile
4. Correct: tile bounces + locks in green
5. Wrong: label snaps back with gentle wobble
6. Works on both touch (mobile) and mouse (desktop)

---

## 7. Feedback Mechanics

### On Correct Answer ✅
- **Animation:** chosen element scales up (bounce), burst of sparkles/stars around it
- **Message** (one of several rotating):
  - "ممتاز! Excellent! ⭐"
  - "زين جداً! Well done! 🌟"
  - "أحسنت! Great job! 🎉"
- **Confetti burst** (canvas-confetti, 1 s duration)
- **+Stars** counter animates up

### On Wrong Answer ❌
- **Animation:** chosen element does a short horizontal **shake** (CSS keyframe, ~400 ms)
- **Colour:** element briefly flashes a **soft red/pink** border, then returns to normal
- **Message** (gentle, encouraging):
  - "حاول مرة ثانية! Try again! 💪"
  - "قريب! Almost there! 😊"
- No sound, no harsh visuals, no loss of stars
- Correct answer is NOT revealed immediately — kid must keep trying
- After **3 wrong attempts** on same question: pronunciation hint fades in as a gentle nudge

### Streak & Combo
- 3 correct in a row → **"Combo x3! 🔥"** mini banner slides in
- 5 in a row → extra ⭐ bonus

---

## 8. Gamification & Badges

### Stars
- +1 ⭐ per correct answer
- +1 ⭐ bonus for first-try correct
- +2 ⭐ bonus for completing a full round with no mistakes

### Badges (examples)

| Badge | Condition |
|---|---|
| 🌟 First Word | Answer first question correctly |
| 🔢 Number Star | Complete NUMBERS with ≥ 80% |
| 🎨 Colour Wizard | Complete COLOURS with ≥ 80% |
| 🍎 Foodie | Complete FOOD + FOOD & DRINK |
| 🐾 Animal Expert | Complete ANIMALS with 100% |
| 👨‍👩‍👧 Family Bonds | Complete FAMILY |
| 🔥 3-Day Streak | Play 3 days in a row |
| 🔥🔥 Week Warrior | Play 7 days in a row |
| ⚡ Speedster | Finish Connect the Columns under 30 s |
| 🏆 Arabic Star | Answer 100 questions total correctly |
| 💯 Perfect Round | Complete any round with 100% |
| 🗺️ Explorer | Play all 20 categories at least once |

Badges are shown with a gentle pop-in animation when unlocked.

---

## 9. Visual Design Language

### Colour Palette
- **Background:** soft cream `#FFF9F0` (avoids harsh white)
- **Primary:** vibrant teal `#00BFA5`
- **Accent 1:** sunny yellow `#FFD600`
- **Accent 2:** coral pink `#FF6B6B`
- **Accent 3:** sky blue `#42A5F5`
- **Text:** deep navy `#1A237E`
- Category cards each get their own pastel background tint

### Typography
- UI labels: **Nunito** (rounded, friendly, Latin)
- Arabic words: **Amiri** or **Noto Naskh Arabic** (clear, kid-readable)
- Arabic text is always `dir="rtl"`, large (`2rem+`)
- Pronunciation guide: monospace-light, smaller, grey

### Animations (CSS only, respects `prefers-reduced-motion`)
- Card flip: 3D `rotateY` transition
- Bounce: `@keyframes bounce` on correct feedback
- Shake: `@keyframes shake` on wrong feedback
- Sparkle: CSS star pseudo-elements that scale + fade
- Progress bar: smooth `width` transition
- Page transitions: slide-in from right

### Layout
- **Mobile-first**, fully responsive (works on tablets & desktops)
- Minimum touch target: 48×48 px (WCAG AA)
- Max content width: 600 px (centred on wide screens)
- Category grid: 2-column on mobile, 3-column on tablet+

---

## 10. File Structure

```
/
├── index.html          ← single entry point
├── config.js           ← Azure Table Storage SAS URL (user fills in; gitignored)
├── styles/
│   ├── base.css        ← reset, fonts, variables
│   ├── layout.css      ← screens, grid, nav
│   ├── components.css  ← cards, buttons, progress
│   └── animations.css  ← all keyframes
├── js/
│   ├── data.js         ← word array (converted from CSV)
│   ├── profile.js      ← localStorage read/write helpers
│   ├── sync.js         ← Azure Table Storage REST sync (graceful fallback)
│   ├── router.js       ← simple hash-based screen switcher
│   ├── games/
│   │   ├── flashcard.js
│   │   ├── multipleChoice.js
│   │   ├── connectColumns.js
│   │   └── dragDrop.js
│   ├── badges.js       ← badge unlock logic
│   └── app.js          ← bootstrap + screen orchestration
└── assets/
    └── avatars/        ← 8 open-source SVG cartoon avatars
```

---

## 11. Azure Table Storage Sync

### How it works (client-side only, no backend)

```
browser JS  ──REST──▶  Azure Table Storage
                       (SAS-authenticated)
```

1. User fills in `config.js` with their SAS URL (generated once in Azure Portal)
2. `sync.js` reads/writes a single table row per device:
   - **PartitionKey:** `deviceId` (UUID auto-generated on first run, stored in localStorage)
   - **RowKey:** `"profile"`
   - **Data:** JSON-serialised profile blob (all progress, badges, stars)
3. **On app startup:** fetch row from Azure → merge with localStorage (most-recent `lastPlayed` wins)
4. **On every save:** write localStorage instantly → async MERGE to Azure (fire-and-forget)
5. **If Azure unavailable / not configured:** silent fallback to localStorage-only; sync indicator shows "Offline"

### SAS Token setup (documented in README)

```
Azure Portal → Storage Account → Shared access signature
  Allowed services:       Table
  Allowed resource types: Object
  Allowed permissions:    Read, Add, Update  (NO Delete, NO List, NO Admin)
  Expiry:                 1–2 years (user's choice)
  → Generate SAS and connection string
  → Copy "Table service SAS URL" → paste into config.js
```

### Security posture
- SAS token is visible in client-side JS — this is inherent to the static-app pattern
- Scope limited to one table, Add+Update+Read only — cannot delete data or access account
- Worst-case: a stranger who extracts the SAS can overwrite a device's progress row
- No PII stored beyond a first name chosen by the user
- Users can rotate the SAS token at any time to invalidate old tokens

### `config.js` format
```js
// Fill in your Azure Table Storage SAS URL below, or leave empty for localStorage-only mode
const AZURE_TABLE_SAS_URL = "";
// Example: "https://mystorage.table.core.windows.net/arabiyati?sv=2022-11-02&ss=t&..."
```

---

## 12. Out of Scope (v1)

- Audio pronunciation (no sounds per requirements)
- Multiplayer / shared profiles
- Printing worksheets
- Arabic script handwriting practice
- Backend sync / cloud save
- PWA / offline service worker _(easy to add in v2)_
- Multi-profile support per device (v2)
- Cross-device leaderboard using Azure Table Storage (v2)

---

## 13. Decisions Log

| # | Decision |
|---|---|
| 1 | App name: **Arabiyati · عربيتي** |
| 2 | FOOD + FOOD & DRINK → merged into single **FOOD** category |
| 3 | Small categories: show **all available words** |
| 4 | Modes are **progressively unlocked** (each requires ≥ 70% on previous) |
| 5 | Profile reset: prompt age → allow only if **≥ 18** |
| 6 | Avatars: **open-source SVG** set |
| 7 | UI language: **bilingual** (English + Arabic) |
| 8 | Storage: **localStorage primary + Azure Table Storage cloud sync** (optional, graceful fallback) |

---

_Ready to build upon your approval._
