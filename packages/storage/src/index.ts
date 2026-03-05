import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { RunResult } from "@typing-master/typing-engine";
import type { Settings } from "@typing-master/protocol";

export interface Profile {
  id: string;
  nickname: string;
  createdAt: string;
}

export type TrainingTier = "rookie" | "cadet" | "pro" | "elite" | "master";

export interface TrainingProgress {
  points: number;
  tier: TrainingTier;
  completedDrills: number;
  bestWpm: number;
  bestAccuracy: number;
  lastTrainedAt: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "default",
  sound: true,
  showKeyboard: false,
  keyAnimation: true,
  caretStyle: "line",
  strictMode: true,
  historyRetentionDays: 90
};

const DEFAULT_TRAINING: TrainingProgress = {
  points: 0,
  tier: "rookie",
  completedDrills: 0,
  bestWpm: 0,
  bestAccuracy: 0,
  lastTrainedAt: null
};

export class Storage {
  private db: Database.Database;

  constructor(private readonly dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
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
      CREATE TABLE IF NOT EXISTS training_progress (
        id INTEGER PRIMARY KEY CHECK (id=1),
        json TEXT NOT NULL
      );
    `);
    const existing = this.db.prepare("SELECT id FROM settings WHERE id=1").get();
    if (!existing) {
      this.db.prepare("INSERT INTO settings(id, json) VALUES (1, ?)").run(JSON.stringify(DEFAULT_SETTINGS));
    }
    const training = this.db.prepare("SELECT id FROM training_progress WHERE id=1").get();
    if (!training) {
      this.db.prepare("INSERT INTO training_progress(id, json) VALUES (1, ?)").run(JSON.stringify(DEFAULT_TRAINING));
    }
  }

  getOrCreateProfile(nickname = "Guest"): Profile {
    const row = this.db.prepare("SELECT id, nickname, created_at as createdAt FROM profile LIMIT 1").get() as Profile | undefined;
    if (row) return row;
    const profile: Profile = {
      id: `local-${Date.now()}`,
      nickname,
      createdAt: new Date().toISOString()
    };
    this.db.prepare("INSERT INTO profile(id, nickname, created_at) VALUES (?, ?, ?)").run(profile.id, profile.nickname, profile.createdAt);
    return profile;
  }

  getSettings(): Settings {
    const row = this.db.prepare("SELECT json FROM settings WHERE id=1").get() as { json: string };
    const saved = JSON.parse(row.json) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  saveSettings(settings: Settings): void {
    this.db.prepare("UPDATE settings SET json = ? WHERE id=1").run(JSON.stringify(settings));
  }

  getTrainingProgress(): TrainingProgress {
    const row = this.db.prepare("SELECT json FROM training_progress WHERE id=1").get() as { json: string };
    const saved = JSON.parse(row.json) as Partial<TrainingProgress>;
    return { ...DEFAULT_TRAINING, ...saved };
  }

  saveTrainingProgress(progress: TrainingProgress): void {
    this.db.prepare("UPDATE training_progress SET json = ? WHERE id=1").run(JSON.stringify(progress));
  }

  recordTrainingRun(run: RunResult): TrainingProgress {
    const prev = this.getTrainingProgress();
    const base = Math.max(5, Math.round(run.netWpm / 2));
    const accBonus = run.accuracy >= 98 ? 20 : run.accuracy >= 95 ? 12 : run.accuracy >= 90 ? 6 : 0;
    const mistakePenalty = Math.min(10, run.mistakes);
    const pointsGain = Math.max(1, base + accBonus - mistakePenalty);
    const points = prev.points + pointsGain;
    const next: TrainingProgress = {
      points,
      tier: tierFromPoints(points),
      completedDrills: prev.completedDrills + 1,
      bestWpm: Math.max(prev.bestWpm, run.netWpm),
      bestAccuracy: Math.max(prev.bestAccuracy, run.accuracy),
      lastTrainedAt: new Date().toISOString()
    };
    this.saveTrainingProgress(next);
    return next;
  }

  addRun(run: RunResult): void {
    this.db.prepare(`
      INSERT INTO runs(mode, started_at, duration_ms, gross_wpm, net_wpm, accuracy, cpm, mistakes, text_id, input_trace_hash)
      VALUES (@mode, @startedAt, @durationMs, @grossWpm, @netWpm, @accuracy, @cpm, @mistakes, @textId, @inputTraceHash)
    `).run(run as unknown as Record<string, unknown>);
  }

  pruneHistory(retentionDays = this.getSettings().historyRetentionDays): number {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
    const result = this.db.prepare("DELETE FROM runs WHERE started_at < ?").run(cutoff);
    return result.changes;
  }

  getRuns(limit = 200): RunResult[] {
    return this.db.prepare(`
      SELECT mode, started_at as startedAt, duration_ms as durationMs, gross_wpm as grossWpm,
             net_wpm as netWpm, accuracy, cpm, mistakes, text_id as textId, input_trace_hash as inputTraceHash
      FROM runs ORDER BY started_at DESC LIMIT ?
    `).all(limit) as RunResult[];
  }

  getStats90d(): {
    bestWpm: number;
    avgWpm: number;
    avgAccuracy: number;
    consistency: number;
    totalRuns: number;
  } {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const rows = this.db.prepare("SELECT net_wpm as netWpm, accuracy FROM runs WHERE started_at >= ?").all(cutoff) as Array<{ netWpm: number; accuracy: number }>;
    if (rows.length === 0) return { bestWpm: 0, avgWpm: 0, avgAccuracy: 0, consistency: 0, totalRuns: 0 };
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

  exportRuns(format: "json" | "csv"): string {
    const runs = this.getRuns(5000);
    if (format === "json") return JSON.stringify(runs, null, 2);
    const header = "mode,startedAt,durationMs,grossWpm,netWpm,accuracy,cpm,mistakes,textId,inputTraceHash";
    const lines = runs.map((r) => [
      r.mode, r.startedAt, r.durationMs, r.grossWpm, r.netWpm, r.accuracy, r.cpm, r.mistakes, r.textId, r.inputTraceHash
    ].join(","));
    return [header, ...lines].join("\n");
  }

  importCustomText(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }

  close(): void {
    this.db.close();
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tierFromPoints(points: number): TrainingTier {
  if (points >= 1100) return "master";
  if (points >= 700) return "elite";
  if (points >= 350) return "pro";
  if (points >= 150) return "cadet";
  return "rookie";
}

