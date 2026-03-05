import crypto from "node:crypto";

export type RunMode = "lesson" | "test" | "custom" | "race";

export interface KeystrokeEvent {
  char: string;
  index: number;
  expected: string;
  correct: boolean;
  at: number;
}

export interface RunResult {
  mode: RunMode;
  startedAt: string;
  durationMs: number;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  cpm: number;
  mistakes: number;
  textId: string;
  inputTraceHash: string;
}

export interface SessionSnapshot {
  target: string;
  typed: string;
  cursor: number;
  mistakes: number;
  correctChars: number;
  done: boolean;
}

export class TypingSession {
  private readonly startedAt = Date.now();
  private typed = "";
  private mistakes = 0;
  private correctChars = 0;
  private readonly events: KeystrokeEvent[] = [];

  constructor(public readonly target: string, public readonly strictMode = true) {}

  get snapshot(): SessionSnapshot {
    return {
      target: this.target,
      typed: this.typed,
      cursor: this.typed.length,
      mistakes: this.mistakes,
      correctChars: this.correctChars,
      done: this.typed.length >= this.target.length
    };
  }

  applyKey(char: string, atMs = Date.now()): SessionSnapshot {
    if (char === "\b") {
      this.backspace();
      return this.snapshot;
    }
    if (this.snapshot.done) return this.snapshot;
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
    if (correct) this.correctChars += 1;
    this.events.push({ char, index: idx, expected, correct, at: atMs });
    return this.snapshot;
  }

  backspace(): void {
    if (this.typed.length === 0) return;
    const removedIdx = this.typed.length - 1;
    const removedChar = this.typed[removedIdx];
    const expected = this.target[removedIdx] ?? "";
    if (removedChar === expected) {
      this.correctChars = Math.max(0, this.correctChars - 1);
    }
    this.typed = this.typed.slice(0, -1);
  }

  finalize(mode: RunMode, textId: string, endedAtMs = Date.now()): RunResult {
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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
