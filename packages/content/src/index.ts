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

const WORDS: string[] = [
  "time", "focus", "keyboard", "speed", "practice", "precision", "terminal", "lesson", "progress", "discipline",
  "accuracy", "rhythm", "streak", "consistency", "engine", "window", "network", "cursor", "profile", "result"
];

export function getLessons(): Lesson[] {
  return LESSONS;
}

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3
};

export function getLessonsForDifficulty(level: Difficulty): Lesson[] {
  return LESSONS.filter((l) => DIFFICULTY_RANK[l.level] <= DIFFICULTY_RANK[level]);
}

export interface DifficultyConfig {
  label: string;
  wordCount: number;
  seedOffset: number;
  loadingTicks: number;
  custom: { punctuation: boolean; numbers: boolean; caseSensitive: boolean };
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

export function getLessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
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
