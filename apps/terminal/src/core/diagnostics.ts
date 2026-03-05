import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Settings } from "./protocol.js";

export interface TerminalDoctorReport {
  platform: NodeJS.Platform;
  nodeVersion: string;
  terminalHost: string;
  shell: string;
  supportsUnicode: boolean;
  supportsColor: boolean;
  recommendedInputStrategy: Settings["inputStrategy"];
  warnings: string[];
}

export interface PerfSnapshot {
  renderMs: number;
  inputLagMs: number;
  droppedFrames: number;
}

export class PerfTracker {
  private lastInputAt = 0;
  private renderMs = 0;
  private inputLagMs = 0;
  private droppedFrames = 0;
  private readonly budgetMs: number;

  constructor(budgetMs = 12) {
    this.budgetMs = budgetMs;
  }

  markInput(): void {
    this.lastInputAt = Date.now();
  }

  beginRender(): number {
    return Date.now();
  }

  endRender(startedAt: number): void {
    const now = Date.now();
    this.renderMs = now - startedAt;
    if (this.lastInputAt > 0) this.inputLagMs = Math.max(0, now - this.lastInputAt);
    if (this.renderMs > this.budgetMs) this.droppedFrames += 1;
  }

  snapshot(): PerfSnapshot {
    return {
      renderMs: this.renderMs,
      inputLagMs: this.inputLagMs,
      droppedFrames: this.droppedFrames
    };
  }
}

export class DiagnosticsLogger {
  private readonly logFile: string;
  constructor(private readonly enabled: boolean) {
    const dir = path.join(os.homedir(), ".typing-master", "logs");
    fs.mkdirSync(dir, { recursive: true });
    this.logFile = path.join(dir, "diagnostics.ndjson");
  }

  log(event: string, payload: Record<string, unknown>): void {
    if (!this.enabled) return;
    const entry = JSON.stringify({ ts: new Date().toISOString(), event, ...payload });
    fs.appendFileSync(this.logFile, `${entry}\n`, "utf8");
  }

  get path(): string {
    return this.logFile;
  }
}

export function diagnosticsLogPath(): string {
  return path.join(os.homedir(), ".typing-master", "logs", "diagnostics.ndjson");
}

export function detectTerminalHost(): string {
  if (process.env.WT_SESSION) return "windows-terminal";
  if ((process.env.TERM_PROGRAM ?? "").toLowerCase().includes("iterm")) return "iterm2";
  if ((process.env.TERM_PROGRAM ?? "").toLowerCase().includes("apple_terminal")) return "terminal-app";
  const shell = (process.env.ComSpec ?? process.env.SHELL ?? "").toLowerCase();
  if (shell.includes("powershell")) return "powershell";
  return "other";
}

export function runDoctor(): TerminalDoctorReport {
  const host = detectTerminalHost();
  const warnings: string[] = [];
  if (host === "powershell") warnings.push("PowerShell host can be slower for heavy mouse-motion TUIs.");
  if (!process.stdout.isTTY) warnings.push("Not running in a TTY terminal.");
  const supportsUnicode = process.platform !== "win32" || Boolean(process.env.WT_SESSION);
  const supportsColor = Boolean(process.stdout.isTTY && (process.env.TERM || process.env.COLORTERM));
  const recommendedInputStrategy: Settings["inputStrategy"] = process.platform === "win32" ? "raw" : "keypress";
  return {
    platform: process.platform,
    nodeVersion: process.version,
    terminalHost: host,
    shell: process.env.ComSpec ?? process.env.SHELL ?? "unknown",
    supportsUnicode,
    supportsColor,
    recommendedInputStrategy,
    warnings
  };
}

export function runBenchmark(iterations = 3000): {
  iterations: number;
  elapsedMs: number;
  avgIterationUs: number;
} {
  const start = performance.now();
  let x = 0;
  for (let i = 0; i < iterations; i++) {
    x += Math.sqrt(i * 13.37) / (i + 1);
  }
  const elapsedMs = performance.now() - start + (x > 0 ? 0 : 0);
  return {
    iterations,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    avgIterationUs: Math.round((elapsedMs * 1000 / iterations) * 100) / 100
  };
}
