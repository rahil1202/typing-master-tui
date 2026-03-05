import type { RunResult } from "@typing-master/typing-engine";
import type { Settings } from "@typing-master/protocol";
export interface Profile {
    id: string;
    nickname: string;
    createdAt: string;
}
export declare class Storage {
    private readonly dbPath;
    private db;
    constructor(dbPath: string);
    private init;
    getOrCreateProfile(nickname?: string): Profile;
    getSettings(): Settings;
    saveSettings(settings: Settings): void;
    addRun(run: RunResult): void;
    pruneHistory(retentionDays?: number): number;
    getRuns(limit?: number): RunResult[];
    getStats90d(): {
        bestWpm: number;
        avgWpm: number;
        avgAccuracy: number;
        consistency: number;
        totalRuns: number;
    };
    exportRuns(format: "json" | "csv"): string;
    importCustomText(filePath: string): string;
    close(): void;
}
//# sourceMappingURL=index.d.ts.map