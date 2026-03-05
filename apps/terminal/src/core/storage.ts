import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { RunResult } from "./typingEngine.js";
import type { Settings } from "./protocol.js";

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

export interface CoachInsights {
  runsAnalyzed: number;
  weakestKeys: Array<{ key: string; count: number }>;
  weakestBigrams: Array<{ bigram: string; count: number }>;
  fatigueScore: number;
  dailyTarget: string;
  consistency: number;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "default",
  sound: true,
  showKeyboard: false,
  keyAnimation: true,
  caretStyle: "line",
  strictMode: true,
  historyRetentionDays: 90,
  performanceMode: false,
  reducedMotion: false,
  toastLevel: "minimal",
  inputStrategy: "auto",
  preferredTerminalHost: "auto",
  onboardingCompleted: false,
  diagnosticsEnabled: false
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
        input_trace_hash TEXT NOT NULL,
        key_mistakes_json TEXT,
        bigram_mistakes_json TEXT
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
    this.ensureRunColumn("key_mistakes_json", "TEXT");
    this.ensureRunColumn("bigram_mistakes_json", "TEXT");
  }

  private ensureRunColumn(column: string, type: string): void {
    const cols = this.db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === column)) return;
    this.db.exec(`ALTER TABLE runs ADD COLUMN ${column} ${type}`);
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
    this.db.prepare("UPDATE training_progress SET json = ? WHERE id=1").run(JSON.stringify(next));
    return next;
  }

  addRun(run: RunResult): void {
    this.db.prepare(`
      INSERT INTO runs(mode, started_at, duration_ms, gross_wpm, net_wpm, accuracy, cpm, mistakes, text_id, input_trace_hash, key_mistakes_json, bigram_mistakes_json)
      VALUES (@mode, @startedAt, @durationMs, @grossWpm, @netWpm, @accuracy, @cpm, @mistakes, @textId, @inputTraceHash, @keyMistakesJson, @bigramMistakesJson)
    `).run({
      ...run,
      keyMistakesJson: run.keyMistakes ? JSON.stringify(run.keyMistakes) : null,
      bigramMistakesJson: run.bigramMistakes ? JSON.stringify(run.bigramMistakes) : null
    } as Record<string, unknown>);
  }

  pruneHistory(retentionDays = this.getSettings().historyRetentionDays): number {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
    const result = this.db.prepare("DELETE FROM runs WHERE started_at < ?").run(cutoff);
    return result.changes;
  }

  getRuns(limit = 200): RunResult[] {
    return this.db.prepare(`
      SELECT mode, started_at as startedAt, duration_ms as durationMs, gross_wpm as grossWpm,
             net_wpm as netWpm, accuracy, cpm, mistakes, text_id as textId, input_trace_hash as inputTraceHash,
             key_mistakes_json as keyMistakesJson, bigram_mistakes_json as bigramMistakesJson
      FROM runs ORDER BY started_at DESC LIMIT ?
    `).all(limit).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        mode: r.mode as RunResult["mode"],
        startedAt: r.startedAt as string,
        durationMs: r.durationMs as number,
        grossWpm: r.grossWpm as number,
        netWpm: r.netWpm as number,
        accuracy: r.accuracy as number,
        cpm: r.cpm as number,
        mistakes: r.mistakes as number,
        textId: r.textId as string,
        inputTraceHash: r.inputTraceHash as string,
        keyMistakes: safeJsonRecord(r.keyMistakesJson),
        bigramMistakes: safeJsonRecord(r.bigramMistakesJson)
      } satisfies RunResult;
    });
  }

  getCoachInsights(limit = 50): CoachInsights {
    const runs = this.getRuns(limit);
    if (runs.length === 0) {
      return {
        runsAnalyzed: 0,
        weakestKeys: [],
        weakestBigrams: [],
        fatigueScore: 0,
        dailyTarget: "Complete 3 clean runs at 95%+ accuracy.",
        consistency: 0
      };
    }
    const keyTotals = new Map<string, number>();
    const bigramTotals = new Map<string, number>();
    for (const run of runs) {
      for (const [k, v] of Object.entries(run.keyMistakes ?? {})) {
        keyTotals.set(k, (keyTotals.get(k) ?? 0) + v);
      }
      for (const [k, v] of Object.entries(run.bigramMistakes ?? {})) {
        bigramTotals.set(k, (bigramTotals.get(k) ?? 0) + v);
      }
    }
    const weakestKeys = [...keyTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ key, count }));
    const weakestBigrams = [...bigramTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([bigram, count]) => ({ bigram, count }));
    const avgAcc = runs.reduce((acc, r) => acc + r.accuracy, 0) / runs.length;
    const avgWpm = runs.reduce((acc, r) => acc + r.netWpm, 0) / runs.length;
    const recent = runs.slice(0, 10);
    const old = runs.slice(10, 20);
    const recentAcc = recent.length ? recent.reduce((a, b) => a + b.accuracy, 0) / recent.length : avgAcc;
    const oldAcc = old.length ? old.reduce((a, b) => a + b.accuracy, 0) / old.length : avgAcc;
    const fatigue = round2(Math.max(0, oldAcc - recentAcc));
    const consistency = this.getStats90d().consistency;
    return {
      runsAnalyzed: runs.length,
      weakestKeys,
      weakestBigrams,
      fatigueScore: fatigue,
      dailyTarget: avgAcc < 95
        ? "Reach 95% accuracy for 5 consecutive runs."
        : avgWpm < 60
          ? "Add +5 WPM while staying above 95% accuracy."
          : "Maintain 97%+ accuracy and improve consistency by 5 points.",
      consistency
    };
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
    const header = "mode,startedAt,durationMs,grossWpm,netWpm,accuracy,cpm,mistakes,textId,inputTraceHash,keyMistakes,bigramMistakes";
    const lines = runs.map((r) => [
      r.mode, r.startedAt, r.durationMs, r.grossWpm, r.netWpm, r.accuracy, r.cpm, r.mistakes, r.textId, r.inputTraceHash,
      JSON.stringify(r.keyMistakes ?? {}), JSON.stringify(r.bigramMistakes ?? {})
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

function safeJsonRecord(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return undefined;
  }
}

function tierFromPoints(points: number): TrainingTier {
  if (points >= 1100) return "master";
  if (points >= 700) return "elite";
  if (points >= 350) return "pro";
  if (points >= 150) return "cadet";
  return "rookie";
}
