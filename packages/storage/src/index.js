import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
const DEFAULT_SETTINGS = {
    theme: "default",
    sound: false,
    caretStyle: "line",
    strictMode: true,
    historyRetentionDays: 90
};
export class Storage {
    dbPath;
    db;
    constructor(dbPath) {
        this.dbPath = dbPath;
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.init();
    }
    init() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id=1),
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL,
        started_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        gross_wpm REAL NOT NULL,
        net_wpm REAL NOT NULL,
        accuracy REAL NOT NULL,
        cpm REAL NOT NULL,
        mistakes INTEGER NOT NULL,
        text_id TEXT NOT NULL,
        input_trace_hash TEXT NOT NULL
      );
    `);
        const existing = this.db.prepare("SELECT id FROM settings WHERE id=1").get();
        if (!existing) {
            this.db.prepare("INSERT INTO settings(id, json) VALUES (1, ?)").run(JSON.stringify(DEFAULT_SETTINGS));
        }
    }
    getOrCreateProfile(nickname = "Guest") {
        const row = this.db.prepare("SELECT id, nickname, created_at as createdAt FROM profile LIMIT 1").get();
        if (row)
            return row;
        const profile = {
            id: `local-${Date.now()}`,
            nickname,
            createdAt: new Date().toISOString()
        };
        this.db.prepare("INSERT INTO profile(id, nickname, created_at) VALUES (?, ?, ?)").run(profile.id, profile.nickname, profile.createdAt);
        return profile;
    }
    getSettings() {
        const row = this.db.prepare("SELECT json FROM settings WHERE id=1").get();
        return JSON.parse(row.json);
    }
    saveSettings(settings) {
        this.db.prepare("UPDATE settings SET json = ? WHERE id=1").run(JSON.stringify(settings));
    }
    addRun(run) {
        this.db.prepare(`
      INSERT INTO runs(mode, started_at, duration_ms, gross_wpm, net_wpm, accuracy, cpm, mistakes, text_id, input_trace_hash)
      VALUES (@mode, @startedAt, @durationMs, @grossWpm, @netWpm, @accuracy, @cpm, @mistakes, @textId, @inputTraceHash)
    `).run(run);
    }
    pruneHistory(retentionDays = this.getSettings().historyRetentionDays) {
        const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
        const result = this.db.prepare("DELETE FROM runs WHERE started_at < ?").run(cutoff);
        return result.changes;
    }
    getRuns(limit = 200) {
        return this.db.prepare(`
      SELECT mode, started_at as startedAt, duration_ms as durationMs, gross_wpm as grossWpm,
             net_wpm as netWpm, accuracy, cpm, mistakes, text_id as textId, input_trace_hash as inputTraceHash
      FROM runs ORDER BY started_at DESC LIMIT ?
    `).all(limit);
    }
    getStats90d() {
        const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const rows = this.db.prepare("SELECT net_wpm as netWpm, accuracy FROM runs WHERE started_at >= ?").all(cutoff);
        if (rows.length === 0)
            return { bestWpm: 0, avgWpm: 0, avgAccuracy: 0, consistency: 0, totalRuns: 0 };
        const wpms = rows.map((r) => r.netWpm);
        const avgWpm = wpms.reduce((a, b) => a + b, 0) / wpms.length;
        const variance = wpms.reduce((acc, x) => acc + (x - avgWpm) ** 2, 0) / wpms.length;
        const stddev = Math.sqrt(variance);
        return {
            bestWpm: Math.max(...wpms),
            avgWpm: round2(avgWpm),
            avgAccuracy: round2(rows.reduce((a, b) => a + b.accuracy, 0) / rows.length),
            consistency: round2(Math.max(0, 100 - stddev)),
            totalRuns: rows.length
        };
    }
    exportRuns(format) {
        const runs = this.getRuns(5000);
        if (format === "json")
            return JSON.stringify(runs, null, 2);
        const header = "mode,startedAt,durationMs,grossWpm,netWpm,accuracy,cpm,mistakes,textId,inputTraceHash";
        const lines = runs.map((r) => [
            r.mode, r.startedAt, r.durationMs, r.grossWpm, r.netWpm, r.accuracy, r.cpm, r.mistakes, r.textId, r.inputTraceHash
        ].join(","));
        return [header, ...lines].join("\n");
    }
    importCustomText(filePath) {
        return fs.readFileSync(filePath, "utf8");
    }
    close() {
        this.db.close();
    }
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=index.js.map