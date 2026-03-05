const LESSONS = [
    { id: "home-row-1", title: "Home Row Basics", level: "beginner", text: "asdf jkl; asdf jkl; sad lad flask" },
    { id: "home-row-2", title: "Home Row Words", level: "beginner", text: "all fall ask salad flask lass" },
    { id: "top-row-1", title: "Top Row Reach", level: "intermediate", text: "typewriter quiet quote route write" },
    { id: "numbers-1", title: "Numbers and Symbols", level: "intermediate", text: "Order #42 ships in 3 days at 7:30." },
    { id: "mixed-1", title: "Mixed Paragraph", level: "advanced", text: "Speed is useful, but accuracy under pressure is the real skill." },
    { id: "mixed-2", title: "Rhythm and Flow", level: "advanced", text: "Consistent rhythm reduces errors and improves long-session stamina." }
];
const QUOTES = [
    "The quick brown fox jumps over the lazy dog.",
    "Practice does not make perfect. Perfect practice makes perfect.",
    "Small gains repeated daily become major progress over time."
];
const WORDS = [
    "time", "focus", "keyboard", "speed", "practice", "precision", "terminal", "lesson", "progress", "discipline",
    "accuracy", "rhythm", "streak", "consistency", "engine", "window", "network", "cursor", "profile", "result"
];
export function getLessons() {
    return LESSONS;
}
export function getLessonById(id) {
    return LESSONS.find((l) => l.id === id);
}
export function makeWordTest(wordCount = 25, seed = 1) {
    let s = seed;
    const output = [];
    for (let i = 0; i < wordCount; i++) {
        s = (s * 9301 + 49297) % 233280;
        output.push(WORDS[s % WORDS.length]);
    }
    return output.join(" ");
}
export function pickQuote(seed = Date.now()) {
    return QUOTES[seed % QUOTES.length];
}
export function normalizeCustomText(input, opts) {
    let v = input;
    if (!opts?.punctuation)
        v = v.replace(/[^\w\s]/g, "");
    if (!opts?.numbers)
        v = v.replace(/[0-9]/g, "");
    if (!opts?.caseSensitive)
        v = v.toLowerCase();
    return v.replace(/\s+/g, " ").trim();
}
//# sourceMappingURL=index.js.map