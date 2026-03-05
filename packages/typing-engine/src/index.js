import crypto from "node:crypto";
export class TypingSession {
    target;
    strictMode;
    startedAt = Date.now();
    typed = "";
    mistakes = 0;
    correctChars = 0;
    events = [];
    constructor(target, strictMode = true) {
        this.target = target;
        this.strictMode = strictMode;
    }
    get snapshot() {
        return {
            target: this.target,
            typed: this.typed,
            cursor: this.typed.length,
            mistakes: this.mistakes,
            correctChars: this.correctChars,
            done: this.typed.length >= this.target.length
        };
    }
    applyKey(char, atMs = Date.now()) {
        if (char === "\b") {
            this.backspace();
            return this.snapshot;
        }
        if (this.snapshot.done)
            return this.snapshot;
        const idx = this.typed.length;
        const expected = this.target[idx] ?? "";
        const correct = char === expected;
        if (!correct) {
            this.mistakes += 1;
            this.events.push({ char, index: idx, expected, correct, at: atMs });
            if (this.strictMode) {
                return this.snapshot;
            }
        }
        this.typed += char;
        if (correct)
            this.correctChars += 1;
        this.events.push({ char, index: idx, expected, correct, at: atMs });
        return this.snapshot;
    }
    backspace() {
        if (this.typed.length === 0)
            return;
        const removedIdx = this.typed.length - 1;
        const removedChar = this.typed[removedIdx];
        const expected = this.target[removedIdx] ?? "";
        if (removedChar === expected) {
            this.correctChars = Math.max(0, this.correctChars - 1);
        }
        this.typed = this.typed.slice(0, -1);
    }
    finalize(mode, textId, endedAtMs = Date.now()) {
        const durationMs = Math.max(1, endedAtMs - this.startedAt);
        const minutes = durationMs / 60000;
        const grossWpm = round2((this.typed.length / 5) / minutes);
        const penalty = this.mistakes / minutes / 5;
        const netWpm = round2(Math.max(0, grossWpm - penalty));
        const accuracy = round2((this.correctChars / Math.max(1, this.events.filter(e => e.char !== "\b").length)) * 100);
        const cpm = round2((this.correctChars / minutes));
        const payload = JSON.stringify(this.events);
        return {
            mode,
            startedAt: new Date(this.startedAt).toISOString(),
            durationMs,
            grossWpm,
            netWpm,
            accuracy,
            cpm,
            mistakes: this.mistakes,
            textId,
            inputTraceHash: crypto.createHash("sha256").update(payload).digest("hex")
        };
    }
    getMistakeHeatmap() {
        const map = {};
        for (const e of this.events) {
            if (!e.correct)
                map[e.expected] = (map[e.expected] ?? 0) + 1;
        }
        return map;
    }
    getBigramMistakes() {
        const map = {};
        for (const e of this.events) {
            if (!e.correct && e.index > 0) {
                const bigram = `${this.target[e.index - 1] ?? ""}${e.expected}`;
                map[bigram] = (map[bigram] ?? 0) + 1;
            }
        }
        return map;
    }
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=index.js.map