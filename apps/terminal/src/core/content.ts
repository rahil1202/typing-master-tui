export type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";

export interface Lesson {
  id: string;
  title: string;
  level: Difficulty;
  text: string;
}

const LESSONS: Lesson[] = [
  { id: "home-row-1", title: "Home Row Basics", level: "beginner", text: "asdf jkl; asdf jkl; sad lad flask" },
  { id: "home-row-2", title: "Home Row Words", level: "beginner", text: "all fall ask salad flask lass" },
  { id: "home-row-3", title: "Home Row Rhythm", level: "beginner", text: "dad adds all; fall as a lad asks" },
  { id: "home-row-4", title: "Home Row Accuracy", level: "beginner", text: "jazz adds flair as glass falls; ask safe lads" },
  { id: "top-row-0", title: "Top Row Intro", level: "beginner", text: "qwerty qwerty quiet wire write" },
  { id: "bottom-row-0", title: "Bottom Row Intro", level: "beginner", text: "zxcv zxcv zoom vex mix civic" },
  { id: "top-row-1", title: "Top Row Reach", level: "intermediate", text: "typewriter quiet quote route write" },
  { id: "top-row-2", title: "Top Row Sprint", level: "intermediate", text: "power tower twenty query owner writer" },
  { id: "bottom-row-1", title: "Bottom Row Reach", level: "intermediate", text: "zebra xylophone civic vacuum mixed boxing" },
  { id: "bottom-row-2", title: "Bottom Row Flow", level: "intermediate", text: "vivid boxes mix cozy jazz with maximum focus" },
  { id: "shift-1", title: "Shift and Capitals", level: "intermediate", text: "Fast Fingers Build Better Habits Every Day." },
  { id: "punct-1", title: "Punctuation Drill", level: "intermediate", text: "Wait, pause, breathe; then type: clear, clean, correct." },
  { id: "numbers-1", title: "Numbers and Symbols", level: "intermediate", text: "Order #42 ships in 3 days at 7:30." },
  { id: "numbers-2", title: "Numeric Precision", level: "intermediate", text: "Invoice 2026-17 totals 498.75 after 12% tax." },
  { id: "symbols-2", title: "Symbol Density", level: "advanced", text: "Use () [] {} <> + - * / = safely in code." },
  { id: "mixed-1", title: "Mixed Paragraph", level: "advanced", text: "Speed is useful, but accuracy under pressure is the real skill." },
  { id: "mixed-2", title: "Rhythm and Flow", level: "advanced", text: "Consistent rhythm reduces errors and improves long-session stamina." },
  { id: "mixed-3", title: "Focus Under Load", level: "advanced", text: "During long races, calm breathing and stable cadence beat short bursts of panic speed." },
  { id: "mixed-4", title: "Precision Endurance", level: "advanced", text: "Elite typists protect accuracy first, then scale speed without breaking posture or timing." },
  { id: "quote-advanced-1", title: "Long Quote Practice", level: "advanced", text: "Discipline is choosing between what you want now and what you want most, one keystroke at a time." },
  { id: "race-prep-1", title: "Race Simulation", level: "advanced", text: "Three opponents join the room, the countdown begins, and your first ten words define the momentum." },
  { id: "expert-code-1", title: "Expert Code Stream", level: "expert", text: "const latencyMs = Math.max(8, sampleWindow.reduce((a, b) => a + b, 0) / sampleWindow.length);" },
  { id: "expert-math-1", title: "Expert Mixed Math", level: "expert", text: "If f(x)=x^2+3x-7, then f(12)=173 and delta between checkpoints is 64.25 units." },
  { id: "expert-legal-1", title: "Expert Dense Paragraph", level: "expert", text: "Notwithstanding prior provisions, each participant shall maintain consistent cadence, preserve semantic accuracy, and avoid unverified substitutions under timed constraints." },
  { id: "expert-race-1", title: "Expert Race Pressure", level: "expert", text: "Round finals begin in 5, 4, 3; maintain precision at 110+ WPM while punctuation, numbers, and capitalization remain uncompromised." }
];

const QUOTES: string[] = [
  "The quick brown fox jumps over the lazy dog.",
  "Practice does not make perfect. Perfect practice makes perfect.",
  "Small gains repeated daily become major progress over time."
];

const PARAGRAPHS: Array<{ id: string; level: Difficulty; text: string }> = [
  {
    id: "p1",
    level: "beginner",
    text: "Every day you type, your fingers learn a little more. Slow and accurate practice builds strong habits that make speed feel natural."
  },
  {
    id: "p2",
    level: "beginner",
    text: "Good posture keeps your hands relaxed and your mind calm. When you breathe steadily, your rhythm improves and mistakes drop."
  },
  {
    id: "p3",
    level: "beginner",
    text: "A focused session is better than a rushed session. Watch each word, trust the rhythm, and let your accuracy guide your pace."
  },
  {
    id: "p4",
    level: "intermediate",
    text: "Consistency wins long races. Instead of sudden bursts, maintain a stable cadence and recover quickly when an error appears."
  },
  {
    id: "p5",
    level: "intermediate",
    text: "Strong typists read slightly ahead while finishing the current word. This small preview reduces hesitation and smooths transitions."
  },
  {
    id: "p6",
    level: "intermediate",
    text: "When punctuation and numbers appear, keep your tempo under control. Precision on complex tokens prevents large accuracy penalties."
  },
  {
    id: "p7",
    level: "advanced",
    text: "Under competitive pressure, elite performance depends on deliberate control, not panic. Strategic pacing preserves clarity and throughput."
  },
  {
    id: "p8",
    level: "advanced",
    text: "Technical writing contains symbols, mixed casing, and dense vocabulary. Efficient finger travel and disciplined correction maintain momentum."
  },
  {
    id: "p9",
    level: "expert",
    text: "Sustained high-speed typing requires biomechanical efficiency, cognitive anticipation, and meticulous error recovery across variable complexity."
  },
  {
    id: "p10",
    level: "expert",
    text: "Mastery emerges when execution stays coherent under load: capitalization, punctuation, and numerics remain precise while tempo remains stable."
  }
];

const HARD_WORDS: Record<Difficulty, string[]> = {
  beginner: ["steady", "focus", "rhythm", "calm", "habit"],
  intermediate: ["precision", "cadence", "transition", "punctuation", "preview"],
  advanced: ["throughput", "discipline", "complexity", "strategy", "consistency"],
  expert: ["biomechanical", "anticipation", "meticulous", "coherence", "optimization"]
};

const WORDS: string[] = [
  "time", "focus", "keyboard", "speed", "practice", "precision", "terminal", "lesson", "progress", "discipline",
  "accuracy", "rhythm", "streak", "consistency", "engine", "window", "network", "cursor", "profile", "result"
];

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3
};

export interface DifficultyConfig {
  label: string;
  wordCount: number;
  seedOffset: number;
  loadingTicks: number;
  custom: { punctuation: boolean; numbers: boolean; caseSensitive: boolean };
}

export function getLessonsForDifficulty(level: Difficulty): Lesson[] {
  return LESSONS.filter((l) => DIFFICULTY_RANK[l.level] <= DIFFICULTY_RANK[level]);
}

export function getDifficultyConfig(level: Difficulty): DifficultyConfig {
  const map: Record<Difficulty, DifficultyConfig> = {
    beginner: {
      label: "Beginner",
      wordCount: 22,
      seedOffset: 11,
      loadingTicks: 22,
      custom: { punctuation: false, numbers: false, caseSensitive: false }
    },
    intermediate: {
      label: "Intermediate",
      wordCount: 35,
      seedOffset: 41,
      loadingTicks: 28,
      custom: { punctuation: true, numbers: false, caseSensitive: false }
    },
    advanced: {
      label: "Advanced",
      wordCount: 50,
      seedOffset: 79,
      loadingTicks: 34,
      custom: { punctuation: true, numbers: true, caseSensitive: true }
    },
    expert: {
      label: "Expert",
      wordCount: 70,
      seedOffset: 131,
      loadingTicks: 40,
      custom: { punctuation: true, numbers: true, caseSensitive: true }
    }
  };
  return map[level];
}

export function makeWordTest(wordCount = 25, seed = 1): string {
  let s = seed;
  const output: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    s = (s * 9301 + 49297) % 233280;
    output.push(WORDS[s % WORDS.length]);
  }
  return output.join(" ");
}

export function makeParagraphTest(level: Difficulty, targetWords = 45, seed = Date.now()): string {
  let s = seed;
  const eligible = PARAGRAPHS.filter((p) => DIFFICULTY_RANK[p.level] <= DIFFICULTY_RANK[level]);
  if (eligible.length === 0) return pickQuote(seed);
  s = (s * 1103515245 + 12345) >>> 0;
  let base = eligible[s % eligible.length].text;
  const words = base.split(/\s+/).filter(Boolean);
  const hard = HARD_WORDS[level];

  const enriched: string[] = [];
  for (let i = 0; i < words.length; i++) {
    enriched.push(words[i]);
    if (DIFFICULTY_RANK[level] >= DIFFICULTY_RANK.intermediate && i % 13 === 12) {
      s = (s * 1664525 + 1013904223) >>> 0;
      enriched.push(hard[s % hard.length]);
    }
  }
  base = enriched.join(" ");

  let out = base;
  while (wordCountOf(out) < targetWords) {
    s = (s * 1103515245 + 12345) >>> 0;
    const nxt = eligible[s % eligible.length].text;
    out += ` ${nxt}`;
  }
  return truncateToWords(out, targetWords);
}

export function pickQuote(seed = Date.now()): string {
  return QUOTES[seed % QUOTES.length];
}

export function normalizeCustomText(input: string, opts?: { punctuation?: boolean; numbers?: boolean; caseSensitive?: boolean }): string {
  let v = input;
  if (!opts?.punctuation) v = v.replace(/[^\w\s]/g, "");
  if (!opts?.numbers) v = v.replace(/[0-9]/g, "");
  if (!opts?.caseSensitive) v = v.toLowerCase();
  return v.replace(/\s+/g, " ").trim();
}

export function composeAdaptiveDrill(
  keyMistakes: Array<{ key: string; count: number }>,
  bigramMistakes: Array<{ bigram: string; count: number }>,
  size = 70
): string {
  const units: string[] = [];
  for (const k of keyMistakes.slice(0, 5)) {
    const safe = normalizeCustomText(k.key, { punctuation: true, numbers: true, caseSensitive: true }) || "a";
    for (let i = 0; i < Math.max(2, Math.min(8, k.count)); i++) units.push(safe);
  }
  for (const b of bigramMistakes.slice(0, 5)) {
    const safe = normalizeCustomText(b.bigram, { punctuation: true, numbers: true, caseSensitive: true }) || "th";
    for (let i = 0; i < Math.max(2, Math.min(8, b.count)); i++) units.push(safe);
  }
  if (units.length === 0) return makeParagraphTest("intermediate", size, Math.floor(Date.now() / 1000));
  const words: string[] = [];
  let seed = Date.now() % 2147483647;
  for (let i = 0; i < size; i++) {
    seed = (seed * 48271) % 2147483647;
    const u = units[seed % units.length];
    const w = WORDS[seed % WORDS.length];
    words.push(i % 3 === 0 ? `${u}${w.slice(0, 2)}` : i % 5 === 0 ? `${w}${u}` : u.length >= 2 ? u : `${u}${w[0]}`);
  }
  return words.join(" ");
}

function wordCountOf(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function truncateToWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value.trim();
  return words.slice(0, maxWords).join(" ").trim();
}
