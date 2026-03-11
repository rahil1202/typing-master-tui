export type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";
export type ParagraphFlavor = "standard" | "story";
export type CustomMode =
  | "imported-text"
  | "numbers"
  | "uppercase-only"
  | "lowercase-only"
  | "combined"
  | "hard-combined-symbols";

export interface Lesson {
  id: string;
  title: string;
  level: Difficulty;
  text: string;
}

export interface CustomModeOption {
  id: CustomMode;
  label: string;
  description: string;
}

interface ParagraphEntry {
  id: string;
  level: Difficulty;
  flavor: ParagraphFlavor;
  text: string;
}

const LESSONS: Lesson[] = [
  { id: "home-row-1", title: "Home Row Basics", level: "beginner", text: "asdf jkl; asdf jkl; sad lad flask" },
  { id: "home-row-2", title: "Home Row Words", level: "beginner", text: "all fall ask salad flask lass" },
  { id: "home-row-3", title: "Home Row Rhythm", level: "beginner", text: "dad adds all; fall as a lad asks" },
  { id: "home-row-4", title: "Home Row Accuracy", level: "beginner", text: "jazz adds flair as glass falls; ask safe lads" },
  { id: "top-row-0", title: "Top Row Intro", level: "beginner", text: "qwerty qwerty quiet wire write" },
  { id: "bottom-row-0", title: "Bottom Row Intro", level: "beginner", text: "zxcv zxcv zoom vex mix civic" },
  { id: "home-row-5", title: "Beginner Flow Chain", level: "beginner", text: "safe glass falls as a lad asks for salad again" },
  { id: "top-row-1", title: "Top Row Reach", level: "intermediate", text: "typewriter quiet quote route write" },
  { id: "top-row-2", title: "Top Row Sprint", level: "intermediate", text: "power tower twenty query owner writer" },
  { id: "bottom-row-1", title: "Bottom Row Reach", level: "intermediate", text: "zebra xylophone civic vacuum mixed boxing" },
  { id: "bottom-row-2", title: "Bottom Row Flow", level: "intermediate", text: "vivid boxes mix cozy jazz with maximum focus" },
  { id: "shift-1", title: "Shift and Capitals", level: "intermediate", text: "Fast Fingers Build Better Habits Every Day." },
  { id: "punct-1", title: "Punctuation Drill", level: "intermediate", text: "Wait, pause, breathe; then type: clear, clean, correct." },
  { id: "numbers-1", title: "Numbers and Symbols", level: "intermediate", text: "Order #42 ships in 3 days at 7:30." },
  { id: "numbers-2", title: "Numeric Precision", level: "intermediate", text: "Invoice 2026-17 totals 498.75 after 12% tax." },
  { id: "mixed-0", title: "Upper Lower Switch", level: "intermediate", text: "Signal rises then FALLS before Calm Hands recover control." },
  { id: "symbols-2", title: "Symbol Density", level: "advanced", text: "Use () [] {} <> + - * / = safely in code." },
  { id: "mixed-1", title: "Mixed Paragraph", level: "advanced", text: "Speed is useful, but accuracy under pressure is the real skill." },
  { id: "mixed-2", title: "Rhythm and Flow", level: "advanced", text: "Consistent rhythm reduces errors and improves long-session stamina." },
  { id: "mixed-3", title: "Focus Under Load", level: "advanced", text: "During long races, calm breathing and stable cadence beat short bursts of panic speed." },
  { id: "mixed-4", title: "Precision Endurance", level: "advanced", text: "Elite typists protect accuracy first, then scale speed without breaking posture or timing." },
  { id: "quote-advanced-1", title: "Long Quote Practice", level: "advanced", text: "Discipline is choosing between what you want now and what you want most, one keystroke at a time." },
  { id: "race-prep-1", title: "Race Simulation", level: "advanced", text: "Three opponents join the room, the countdown begins, and your first ten words define the momentum." },
  { id: "story-advanced-1", title: "Story Corridor", level: "advanced", text: "The scout reached the silent corridor, checked the map twice, and typed the warning before the lights failed." },
  { id: "expert-code-1", title: "Expert Code Stream", level: "expert", text: "const latencyMs = Math.max(8, sampleWindow.reduce((a, b) => a + b, 0) / sampleWindow.length);" },
  { id: "expert-math-1", title: "Expert Mixed Math", level: "expert", text: "If f(x)=x^2+3x-7, then f(12)=173 and delta between checkpoints is 64.25 units." },
  { id: "expert-legal-1", title: "Expert Dense Paragraph", level: "expert", text: "Notwithstanding prior provisions, each participant shall maintain consistent cadence, preserve semantic accuracy, and avoid unverified substitutions under timed constraints." },
  { id: "expert-race-1", title: "Expert Race Pressure", level: "expert", text: "Round finals begin in 5, 4, 3; maintain precision at 110+ WPM while punctuation, numbers, and capitalization remain uncompromised." },
  { id: "expert-story-1", title: "Storm Broadcast", level: "expert", text: "At 23:41 the command deck lost its western array, yet the pilot finished the emergency broadcast without dropping a single symbol." }
];

const QUOTES: string[] = [
  "The quick brown fox jumps over the lazy dog.",
  "Practice does not make perfect. Perfect practice makes perfect.",
  "Small gains repeated daily become major progress over time.",
  "Calm hands and clear eyes turn hard passages into clean results.",
  "A steady rhythm beats a rushed sprint almost every time."
];

const PARAGRAPHS: ParagraphEntry[] = [
  {
    id: "p1",
    level: "beginner",
    flavor: "standard",
    text: "Every day you type, your fingers learn a little more. Slow and accurate practice builds strong habits that make speed feel natural."
  },
  {
    id: "p2",
    level: "beginner",
    flavor: "standard",
    text: "Good posture keeps your hands relaxed and your mind calm. When you breathe steadily, your rhythm improves and mistakes drop."
  },
  {
    id: "p3",
    level: "beginner",
    flavor: "standard",
    text: "A focused session is better than a rushed session. Watch each word, trust the rhythm, and let your accuracy guide your pace."
  },
  {
    id: "p4",
    level: "beginner",
    flavor: "story",
    text: "Mina opened the workshop door, found the note on the desk, and copied the first line before the morning bell rang."
  },
  {
    id: "p5",
    level: "intermediate",
    flavor: "standard",
    text: "Consistency wins long races. Instead of sudden bursts, maintain a stable cadence and recover quickly when an error appears."
  },
  {
    id: "p6",
    level: "intermediate",
    flavor: "standard",
    text: "Strong typists read slightly ahead while finishing the current word. This small preview reduces hesitation and smooths transitions."
  },
  {
    id: "p7",
    level: "intermediate",
    flavor: "standard",
    text: "When punctuation and numbers appear, keep your tempo under control. Precision on complex tokens prevents large accuracy penalties."
  },
  {
    id: "p8",
    level: "intermediate",
    flavor: "story",
    text: "The courier ran across the market, hid the message under a crate, and typed the checkpoint code before anyone noticed."
  },
  {
    id: "p9",
    level: "intermediate",
    flavor: "story",
    text: "On the training ship, the rookie copied each command from the captain and watched the dashboard settle into green."
  },
  {
    id: "p10",
    level: "advanced",
    flavor: "standard",
    text: "Under competitive pressure, elite performance depends on deliberate control, not panic. Strategic pacing preserves clarity and throughput."
  },
  {
    id: "p11",
    level: "advanced",
    flavor: "standard",
    text: "Technical writing contains symbols, mixed casing, and dense vocabulary. Efficient finger travel and disciplined correction maintain momentum."
  },
  {
    id: "p12",
    level: "advanced",
    flavor: "story",
    text: "By midnight the archive vault had opened, the alarms had softened, and Kara still needed to type the final sequence from memory."
  },
  {
    id: "p13",
    level: "advanced",
    flavor: "story",
    text: "The rescue drone hovered above the canyon while the navigator entered coordinates, weather notes, and fallback routes without a pause."
  },
  {
    id: "p14",
    level: "expert",
    flavor: "standard",
    text: "Sustained high-speed typing requires biomechanical efficiency, cognitive anticipation, and meticulous error recovery across variable complexity."
  },
  {
    id: "p15",
    level: "expert",
    flavor: "standard",
    text: "Mastery emerges when execution stays coherent under load: capitalization, punctuation, and numerics remain precise while tempo remains stable."
  },
  {
    id: "p16",
    level: "expert",
    flavor: "story",
    text: "The station lost external comms at 03:17, yet the operator still logged every signal, checksum, and route update before dawn."
  },
  {
    id: "p17",
    level: "expert",
    flavor: "story",
    text: "Inside the storm shelter, the engineer balanced equations, warning codes, and crew notes while the walls shook with each impact."
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
  "accuracy", "rhythm", "streak", "consistency", "engine", "window", "network", "cursor", "profile", "result",
  "cadence", "signal", "output", "memory", "screen", "control", "steady", "intent", "launch", "recovery"
];

const NUMBER_TOKENS: string[] = [
  "7", "12", "28", "42", "64", "108", "256", "512", "1024", "2048",
  "3.14", "7.30", "11:45", "23:59", "98.6", "2026", "2027", "17%", "64.25", "88/100"
];

const SYMBOL_TOKENS: string[] = [
  "()",
  "[]",
  "{}",
  "<>",
  "@home",
  "#42",
  "$19.99",
  "A+B=C",
  "!= null",
  "&&",
  "||",
  "=>",
  "::",
  "path/to/file",
  "user_name",
  "signal-rate=64%",
  "{SAFE_MODE}",
  "[core-v2]",
  "(retry=3)"
];

const CUSTOM_MODE_OPTIONS: CustomModeOption[] = [
  { id: "imported-text", label: "Imported Text", description: "Use the text you imported with typing-master import." },
  { id: "numbers", label: "Numbers", description: "Digit-heavy runs with dates, times, percentages, and decimals." },
  { id: "uppercase-only", label: "Uppercase Only", description: "All caps words for shift-key rhythm and control." },
  { id: "lowercase-only", label: "Lowercase Only", description: "Simple lowercase flow without capitals or symbols." },
  { id: "combined", label: "Combined", description: "Mix lowercase, uppercase, and numbers without heavy symbols." },
  { id: "hard-combined-symbols", label: "Hard Combined + Symbols", description: "Dense mixed-case runs with numbers and symbols." }
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

export function getCustomModeOptions(): CustomModeOption[] {
  return CUSTOM_MODE_OPTIONS;
}

export function makeWordTest(wordCount = 25, seed = 1): string {
  let s = seed;
  const output: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    s = nextSeed(s);
    output.push(WORDS[s % WORDS.length]);
  }
  return output.join(" ");
}

export function makeParagraphTest(
  level: Difficulty,
  targetWords = 45,
  seed = Date.now(),
  flavor: ParagraphFlavor | "mixed" = "mixed"
): string {
  let s = seed;
  const eligible = PARAGRAPHS.filter((p) =>
    DIFFICULTY_RANK[p.level] <= DIFFICULTY_RANK[level] && (flavor === "mixed" ? true : p.flavor === flavor)
  );
  if (eligible.length === 0) return pickQuote(seed);
  s = nextSeed(s);
  let base = eligible[s % eligible.length].text;
  const words = base.split(/\s+/).filter(Boolean);
  const hard = HARD_WORDS[level];

  const enriched: string[] = [];
  for (let i = 0; i < words.length; i++) {
    enriched.push(words[i]);
    if (DIFFICULTY_RANK[level] >= DIFFICULTY_RANK.intermediate && i % 13 === 12) {
      s = nextSeed(s);
      enriched.push(hard[s % hard.length]);
    }
  }
  base = enriched.join(" ");

  let out = base;
  while (wordCountOf(out) < targetWords) {
    s = nextSeed(s);
    const nxt = eligible[s % eligible.length].text;
    out += ` ${nxt}`;
  }
  return truncateToWords(out, targetWords);
}

export function pickQuote(seed = Date.now()): string {
  return QUOTES[Math.abs(seed) % QUOTES.length];
}

export function normalizeCustomText(input: string, opts?: { punctuation?: boolean; numbers?: boolean; caseSensitive?: boolean }): string {
  let v = input;
  if (!opts?.punctuation) v = v.replace(/[^\w\s]/g, "");
  if (!opts?.numbers) v = v.replace(/[0-9]/g, "");
  if (!opts?.caseSensitive) v = v.toLowerCase();
  return v.replace(/\s+/g, " ").trim();
}

export function buildCustomModeText(
  mode: CustomMode,
  level: Difficulty,
  seed = Date.now(),
  importedText?: string
): { text: string; textId: string; label: string } {
  const cfg = getDifficultyConfig(level);
  const targetWords = Math.max(18, cfg.wordCount);

  if (mode === "imported-text") {
    let text = normalizeCustomText(importedText ?? "", cfg.custom);
    if (!text) text = makeParagraphTest(level, targetWords, seed, "story");
    return { text, textId: `custom-imported-${level}-${seed}`, label: "Imported Text" };
  }

  if (mode === "numbers") {
    const text = buildNumericSequence(targetWords, seed);
    return { text, textId: `custom-numbers-${level}-${seed}`, label: "Numbers" };
  }

  if (mode === "uppercase-only") {
    const text = buildWordSequence(targetWords, seed, WORDS, (word, index) =>
      index % 7 === 0 ? `${word.toUpperCase()}!` : word.toUpperCase()
    );
    return { text, textId: `custom-uppercase-${level}-${seed}`, label: "Uppercase Only" };
  }

  if (mode === "lowercase-only") {
    const text = buildWordSequence(targetWords, seed, WORDS, (word) => word.toLowerCase());
    return { text, textId: `custom-lowercase-${level}-${seed}`, label: "Lowercase Only" };
  }

  if (mode === "combined") {
    const text = buildCombinedSequence(targetWords, seed, false);
    return { text, textId: `custom-combined-${level}-${seed}`, label: "Combined" };
  }

  const text = buildCombinedSequence(targetWords + 8, seed, true);
  return { text, textId: `custom-hard-combined-${level}-${seed}`, label: "Hard Combined + Symbols" };
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

function buildNumericSequence(targetWords: number, seed: number): string {
  let s = seed;
  const parts: string[] = [];
  for (let i = 0; i < targetWords; i++) {
    s = nextSeed(s);
    const token = NUMBER_TOKENS[s % NUMBER_TOKENS.length];
    parts.push(i % 5 === 0 ? `ID-${token}` : i % 7 === 0 ? `${token}%` : token);
  }
  return parts.join(" ");
}

function buildWordSequence(
  targetWords: number,
  seed: number,
  pool: string[],
  transform: (word: string, index: number) => string
): string {
  let s = seed;
  const out: string[] = [];
  for (let i = 0; i < targetWords; i++) {
    s = nextSeed(s);
    out.push(transform(pool[s % pool.length], i));
  }
  return out.join(" ");
}

function buildCombinedSequence(targetWords: number, seed: number, withSymbols: boolean): string {
  let s = seed;
  const out: string[] = [];
  for (let i = 0; i < targetWords; i++) {
    s = nextSeed(s);
    const word = WORDS[s % WORDS.length];
    const numeric = NUMBER_TOKENS[s % NUMBER_TOKENS.length];
    if (withSymbols && i % 4 === 0) {
      out.push(SYMBOL_TOKENS[s % SYMBOL_TOKENS.length]);
    } else if (i % 5 === 0) {
      out.push(word.toUpperCase());
    } else if (i % 3 === 0) {
      out.push(`${capitalize(word)}${numeric.replace(/[^0-9]/g, "").slice(0, 2) || "7"}`);
    } else if (i % 7 === 0) {
      out.push(numeric);
    } else {
      out.push(word.toLowerCase());
    }
  }
  return out.join(" ");
}

function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function wordCountOf(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function truncateToWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value.trim();
  return words.slice(0, maxWords).join(" ").trim();
}
