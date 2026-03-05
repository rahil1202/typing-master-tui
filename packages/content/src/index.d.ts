export interface Lesson {
    id: string;
    title: string;
    level: "beginner" | "intermediate" | "advanced";
    text: string;
}
export declare function getLessons(): Lesson[];
export declare function getLessonById(id: string): Lesson | undefined;
export declare function makeWordTest(wordCount?: number, seed?: number): string;
export declare function pickQuote(seed?: number): string;
export declare function normalizeCustomText(input: string, opts?: {
    punctuation?: boolean;
    numbers?: boolean;
    caseSensitive?: boolean;
}): string;
//# sourceMappingURL=index.d.ts.map