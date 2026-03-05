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
export declare class TypingSession {
    readonly target: string;
    readonly strictMode: boolean;
    private readonly startedAt;
    private typed;
    private mistakes;
    private correctChars;
    private readonly events;
    constructor(target: string, strictMode?: boolean);
    get snapshot(): SessionSnapshot;
    applyKey(char: string, atMs?: number): SessionSnapshot;
    backspace(): void;
    finalize(mode: RunMode, textId: string, endedAtMs?: number): RunResult;
    getMistakeHeatmap(): Record<string, number>;
    getBigramMistakes(): Record<string, number>;
}
//# sourceMappingURL=index.d.ts.map