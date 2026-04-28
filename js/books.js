// books.js — Simple picture books for early readers.
//
// Each page is a phrase with a unique id. The audio generator
// (scripts/generate_audio.py) parses entries in the same {id,arabic}
// shape used by data.js and produces audio/{id}.mp3, so playback uses
// the same offline-friendly path as words. Browser TTS is NOT used.
//
// IDs ≥ 1000 to avoid collisions with the WORDS list.

const BOOK_PHRASES = [
  // Book 1 · My Colours
  {id:1001,arabic:"تفاحة حمراء",pronunciation:"tuf-faa-ha ham-raa",english:"A red apple",visual:"🍎"},
  {id:1002,arabic:"شجرة خضراء",pronunciation:"sha-ja-ra khad-raa",english:"A green tree",visual:"🌳"},
  {id:1003,arabic:"شمس صفراء",pronunciation:"shams saf-raa",english:"A yellow sun",visual:"☀️"},
  {id:1004,arabic:"بحر أزرق",pronunciation:"ba-har az-raq",english:"A blue sea",visual:"🌊"},
  {id:1005,arabic:"قطة سوداء",pronunciation:"qit-ta saw-daa",english:"A black cat",visual:"⬛"},
  {id:1006,arabic:"وردة وردية",pronunciation:"war-da war-dee-ya",english:"A pink flower",visual:"🌸"},

  // Book 2 · My Family
  {id:1011,arabic:"هذا بابا",pronunciation:"haa-tha baa-ba",english:"This is dad",visual:"👨"},
  {id:1012,arabic:"هذه ماما",pronunciation:"haa-thi maa-ma",english:"This is mom",visual:"👩"},
  {id:1013,arabic:"هذا أخي",pronunciation:"haa-tha akh-ee",english:"This is my brother",visual:"👦"},
  {id:1014,arabic:"هذه أختي",pronunciation:"haa-thi ukh-tee",english:"This is my sister",visual:"👧"},
  {id:1015,arabic:"جدي طيب",pronunciation:"jid-dee tay-yib",english:"My grandpa is kind",visual:"👴"},
  {id:1016,arabic:"جدتي جميلة",pronunciation:"jid-da-tee ja-mee-la",english:"My grandma is beautiful",visual:"👵"},

  // Book 3 · Little Animals
  {id:1021,arabic:"بزون صغير",pronunciation:"bi-zoon sa-gheer",english:"A small cat",visual:"🐱"},
  {id:1022,arabic:"كلب لطيف",pronunciation:"chal-ib la-teef",english:"A nice dog",visual:"🐶"},
  {id:1023,arabic:"طير يطير",pronunciation:"tayr ya-teer",english:"A bird flies",visual:"🐦"},
  {id:1024,arabic:"أرنب يقفز",pronunciation:"ar-nab yaq-fiz",english:"A rabbit jumps",visual:"🐰"},
  {id:1025,arabic:"سمكة بالماي",pronunciation:"sa-ma-ka bil-maay",english:"A fish in water",visual:"🐟"},
  {id:1026,arabic:"أسد قوي",pronunciation:"a-sad qa-wee",english:"A strong lion",visual:"🦁"},

  // Book 4 · Hello and Goodbye (greetings)
  {id:1031,arabic:"صباح الخير",pronunciation:"sa-baah il-kheir",english:"Good morning",visual:"☀️"},
  {id:1032,arabic:"مساء الخير",pronunciation:"mi-saa il-kheir",english:"Good evening",visual:"🌙"},
  {id:1033,arabic:"اهلا وسهلا",pronunciation:"ah-lan wa sah-lan",english:"Welcome",visual:"👋"},
  {id:1034,arabic:"مع السلامة",pronunciation:"ma'a-s-sa-laa-ma",english:"Goodbye",visual:"🤚"},
  {id:1035,arabic:"تصبح على خير",pronunciation:"tis-bah a-la kheir",english:"Good night",visual:"😴"},
  {id:1036,arabic:"الحمد لله",pronunciation:"il-ham-du-lil-laah",english:"Praise be to God",visual:"🙏"},

  // Book 5 · I Feel
  {id:1041,arabic:"اني فرحان",pronunciation:"aa-ni far-haan",english:"I am happy",visual:"😄"},
  {id:1042,arabic:"اني تعبان",pronunciation:"aa-ni ta-baan",english:"I am tired",visual:"😩"},
  {id:1043,arabic:"اني جوعان",pronunciation:"aa-ni joo-aan",english:"I am hungry",visual:"🤤"},
  {id:1044,arabic:"اني عطشان",pronunciation:"aa-ni at-shaan",english:"I am thirsty",visual:"🥤"},
  {id:1045,arabic:"اني زعلان",pronunciation:"aa-ni za-laan",english:"I am sad",visual:"😢"},
  {id:1046,arabic:"اني شبعان",pronunciation:"aa-ni shab-aan",english:"I am full",visual:"😌"},

  // Book 6 · At Home
  {id:1051,arabic:"هذا بيتي",pronunciation:"haa-tha bay-ti",english:"This is my house",visual:"🏠"},
  {id:1052,arabic:"هذا بابي",pronunciation:"haa-tha baa-bi",english:"This is my door",visual:"🚪"},
  {id:1053,arabic:"هذا شباكي",pronunciation:"haa-tha shu-baa-chi",english:"This is my window",visual:"🪟"},
  {id:1054,arabic:"هذا كرسيي",pronunciation:"haa-tha kur-see-yi",english:"This is my chair",visual:"🪑"},
  {id:1055,arabic:"هذا سريري",pronunciation:"haa-tha sa-ree-ri",english:"This is my bed",visual:"🛏️"},
  {id:1056,arabic:"هذي غرفتي",pronunciation:"haa-thi ghur-fa-tee",english:"This is my room",visual:"🛋️"},

  // Book 7 · Food I Love
  {id:1061,arabic:"احب التفاح",pronunciation:"a-hib it-tuf-faah",english:"I love apples",visual:"🍎"},
  {id:1062,arabic:"احب الموز",pronunciation:"a-hib il-mooz",english:"I love bananas",visual:"🍌"},
  {id:1063,arabic:"احب الحليب",pronunciation:"a-hib il-ha-leeb",english:"I love milk",visual:"🥛"},
  {id:1064,arabic:"احب الخبز",pronunciation:"a-hib il-khu-biz",english:"I love bread",visual:"🍞"},
  {id:1065,arabic:"احب التمر",pronunciation:"a-hib it-tam-mar",english:"I love dates",visual:"🌴"},
  {id:1066,arabic:"احب البطيخ",pronunciation:"a-hib il-bat-teekh",english:"I love watermelon",visual:"🍉"},

  // Book 8 · Where I Go
  {id:1071,arabic:"اروح المدرسة",pronunciation:"a-rooh il-mad-ra-sa",english:"I go to school",visual:"🏫"},
  {id:1072,arabic:"اروح السوق",pronunciation:"a-rooh is-soog",english:"I go to the market",visual:"🛒"},
  {id:1073,arabic:"اروح الحديقة",pronunciation:"a-rooh il-ha-dee-qa",english:"I go to the park",visual:"🌳"},
  {id:1074,arabic:"اروح المسجد",pronunciation:"a-rooh il-mas-jid",english:"I go to the mosque",visual:"🕌"},
  {id:1075,arabic:"اروح البحر",pronunciation:"a-rooh il-ba-har",english:"I go to the sea",visual:"🌊"},
  {id:1076,arabic:"اروح بيت جدتي",pronunciation:"a-rooh bayt jid-da-tee",english:"I go to grandma's",visual:"👵"},

  // Book 9 · Today's Weather
  {id:1081,arabic:"اليوم حر",pronunciation:"il-yoom har",english:"Today is hot",visual:"🥵"},
  {id:1082,arabic:"اليوم برد",pronunciation:"il-yoom ba-rid",english:"Today is cold",visual:"🥶"},
  {id:1083,arabic:"اليوم مطر",pronunciation:"il-yoom mu-tar",english:"Today is rainy",visual:"🌧️"},
  {id:1084,arabic:"اليوم شمس",pronunciation:"il-yoom shams",english:"Today is sunny",visual:"☀️"},
  {id:1085,arabic:"اليوم ريح",pronunciation:"il-yoom reeh",english:"Today is windy",visual:"🌬️"},
  {id:1086,arabic:"اليوم ثلج",pronunciation:"il-yoom thalj",english:"Today is snowy",visual:"❄️"},

  // Book 10 · Polite Words
  {id:1091,arabic:"من فضلك",pronunciation:"min fath-lak",english:"Please",visual:"🙇"},
  {id:1092,arabic:"شكرا",pronunciation:"shuk-ran",english:"Thank you",visual:"🙏"},
  {id:1093,arabic:"عفوا",pronunciation:"af-wan",english:"You're welcome",visual:"😊"},
  {id:1094,arabic:"آسف",pronunciation:"aa-sif",english:"Sorry",visual:"😔"},
  {id:1095,arabic:"ممكن مساعدة",pronunciation:"mum-kin mu-saa-a-da",english:"May I have help?",visual:"🤝"},
  {id:1096,arabic:"الله يخليك",pronunciation:"al-la y-khal-leek",english:"Bless you",visual:"💛"},

  // Book 11 · Counting Friends
  {id:1101,arabic:"واحد بزون",pronunciation:"waa-hid bi-zoon",english:"One cat",visual:"🐱"},
  {id:1102,arabic:"اثنين كلاب",pronunciation:"ith-nayn ki-laab",english:"Two dogs",visual:"🐶"},
  {id:1103,arabic:"ثلاثة طيور",pronunciation:"tha-laa-tha tu-yoor",english:"Three birds",visual:"🐦"},
  {id:1104,arabic:"أربعة سمك",pronunciation:"ar-ba-a sa-mak",english:"Four fish",visual:"🐟"},
  {id:1105,arabic:"خمسة نجوم",pronunciation:"kham-sa nu-joom",english:"Five stars",visual:"⭐"},
  {id:1106,arabic:"ستة وردات",pronunciation:"sit-ta wa-ra-daat",english:"Six flowers",visual:"🌸"},

  // Book 12 · Time of Day
  {id:1111,arabic:"الصبح حلو",pronunciation:"is-subh hi-lu",english:"Morning is sweet",visual:"🌅"},
  {id:1112,arabic:"الشمس طالعة",pronunciation:"ish-shams taa-li-a",english:"The sun is up",visual:"☀️"},
  {id:1113,arabic:"الظهر هنا",pronunciation:"ith-thuhr hnaa",english:"Noon is here",visual:"🌤️"},
  {id:1114,arabic:"العصر زين",pronunciation:"il-asr zayn",english:"Afternoon is nice",visual:"🌇"},
  {id:1115,arabic:"المغرب هلو",pronunciation:"il-magh-rib hi-lu",english:"Sunset is sweet",visual:"🌆"},
  {id:1116,arabic:"الليل ظلمة",pronunciation:"il-layl thul-ma",english:"Night is dark",visual:"🌃"},
];

// Build a quick lookup
const BOOK_PHRASE_BY_ID = Object.fromEntries(BOOK_PHRASES.map(p => [p.id, p]));

const BOOKS = [
  { id: 'colors',    title: 'My Colours',         titleAr: 'ألواني',          cover: '🌈', pageIds: [1001,1002,1003,1004,1005,1006] },
  { id: 'family',    title: 'My Family',          titleAr: 'عائلتي',          cover: '👨‍👩‍👧', pageIds: [1011,1012,1013,1014,1015,1016] },
  { id: 'animals',   title: 'Little Animals',     titleAr: 'الحيوانات الصغيرة', cover: '🐾', pageIds: [1021,1022,1023,1024,1025,1026] },
  { id: 'greetings', title: 'Hello and Goodbye',  titleAr: 'أهلاً ومع السلامة', cover: '👋', pageIds: [1031,1032,1033,1034,1035,1036] },
  { id: 'feelings',  title: 'I Feel',             titleAr: 'أنا أشعر',         cover: '😊', pageIds: [1041,1042,1043,1044,1045,1046] },
  { id: 'home',      title: 'At Home',            titleAr: 'في البيت',         cover: '🏠', pageIds: [1051,1052,1053,1054,1055,1056] },
  { id: 'food',      title: 'Food I Love',        titleAr: 'الأكل اللي أحبه',  cover: '🍎', pageIds: [1061,1062,1063,1064,1065,1066] },
  { id: 'places',    title: 'Where I Go',         titleAr: 'وين أروح',         cover: '🚶', pageIds: [1071,1072,1073,1074,1075,1076] },
  { id: 'weather',   title: "Today's Weather",    titleAr: 'طقس اليوم',        cover: '🌤️', pageIds: [1081,1082,1083,1084,1085,1086] },
  { id: 'polite',    title: 'Polite Words',       titleAr: 'كلمات مؤدبة',      cover: '🙏', pageIds: [1091,1092,1093,1094,1095,1096] },
  { id: 'counting',  title: 'Counting Friends',   titleAr: 'نعد الأصحاب',      cover: '🔢', pageIds: [1101,1102,1103,1104,1105,1106] },
  { id: 'time',      title: 'Time of Day',        titleAr: 'وقت اليوم',        cover: '⏰', pageIds: [1111,1112,1113,1114,1115,1116] },
];
