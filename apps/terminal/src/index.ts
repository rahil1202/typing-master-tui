#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { diagnosticsLogPath, runBenchmark, runDoctor } from "./core/diagnostics.js";
import { Storage, type CoachInsights } from "./core/storage.js";
import type { ClientEvent, ServerEvent } from "./core/protocol.js";

const program = new Command();
program.name("typing-master").description("Terminal Typing Master clone");
program.option("--perf", "show lightweight performance HUD in TUI", false);

function getDbPath(): string {
  const home = os.homedir();
  const dataDir = path.join(home, ".typing-master");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "typing-master.db");
}

program
  .command("import")
  .argument("<file>")
  .description("Import custom test text from file")
  .action((file) => {
    const storage = new Storage(getDbPath());
    try {
      const text = storage.importCustomText(path.resolve(file));
      const outPath = path.join(os.homedir(), ".typing-master", "last-import.txt");
      fs.writeFileSync(outPath, text, "utf8");
      console.log(`Imported ${text.length} chars to ${outPath}`);
    } finally {
      storage.close();
    }
  });

program
  .command("export")
  .option("--format <format>", "json or csv", "json")
  .description("Export run history")
  .action((opts: { format: "json" | "csv" }) => {
    if (opts.format !== "json" && opts.format !== "csv") {
      console.error("Invalid format. Use --format json or --format csv");
      process.exit(1);
    }
    const storage = new Storage(getDbPath());
    try {
      const out = storage.exportRuns(opts.format);
      const outPath = path.join(os.homedir(), ".typing-master", `runs-export.${opts.format}`);
      fs.writeFileSync(outPath, out, "utf8");
      console.log(`Exported to ${outPath}`);
    } finally {
      storage.close();
    }
  });

program
  .command("race")
  .requiredOption("--nickname <name>")
  .option("--server <url>", "race server ws url", "ws://localhost:8080")
  .description("Join multiplayer race queue")
  .action(async (opts: { nickname: string; server: string }) => {
    const { default: WebSocket } = await import("ws");
    const ws = new WebSocket(opts.server);
    ws.on("open", () => {
      const evt: ClientEvent = { type: "queue.join", nickname: opts.nickname };
      ws.send(JSON.stringify(evt));
      console.log(`Joined queue as ${opts.nickname}`);
    });

    ws.on("message", (msg) => {
      const evt = JSON.parse(msg.toString()) as ServerEvent;
      console.log(`[${evt.type}]`, evt);
    });

    ws.on("close", () => process.exit(0));
    ws.on("error", (err) => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command("doctor")
  .description("Run terminal compatibility and input diagnostics")
  .action(() => {
    const report = runDoctor();
    console.log(JSON.stringify(report, null, 2));
  });

program
  .command("benchmark")
  .option("--iterations <n>", "number of benchmark iterations", "3000")
  .description("Run local performance benchmark")
  .action((opts: { iterations: string }) => {
    const iterations = Number.parseInt(opts.iterations, 10);
    const result = runBenchmark(Number.isFinite(iterations) ? Math.max(500, iterations) : 3000);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("coach")
  .option("--json", "output raw JSON")
  .description("Show coaching insights from recent runs")
  .action((opts: { json?: boolean }) => {
    const storage = new Storage(getDbPath());
    try {
      const insights = storage.getCoachInsights(50);
      if (opts.json) {
        console.log(JSON.stringify(insights, null, 2));
        return;
      }
      printCoachSummary(insights);
    } finally {
      storage.close();
    }
  });

program
  .command("logs")
  .option("--export <file>", "export diagnostics logs to a file")
  .description("Inspect or export local diagnostics logs")
  .action((opts: { export?: string }) => {
    const src = diagnosticsLogPath();
    if (!fs.existsSync(src)) {
      console.log("No diagnostics logs found.");
      return;
    }
    if (!opts.export) {
      console.log(src);
      return;
    }
    const out = path.resolve(opts.export);
    fs.copyFileSync(src, out);
    console.log(`Diagnostics exported to ${out}`);
  });

program
  .command("play", { isDefault: true })
  .description("Launch full-screen TUI (recommended)")
  .action(async () => {
    const options = program.opts<{ perf?: boolean }>();
    const { runTui } = await import("./tui.js");
    runTui(getDbPath(), { perfHud: Boolean(options.perf) });
  });

program
  .command("play-ink")
  .description("Launch Ink UI (line-based)")
  .action(async () => {
    const { runInkApp } = await import("./inkApp.js");
    runInkApp(getDbPath());
  });

program.parse(process.argv);

function printCoachSummary(insights: CoachInsights): void {
  console.log(`Runs analyzed: ${insights.runsAnalyzed}`);
  console.log(`Consistency: ${insights.consistency}`);
  console.log(`Fatigue score: ${insights.fatigueScore}`);
  console.log(`Daily target: ${insights.dailyTarget}`);
  console.log("Weakest keys:");
  for (const item of insights.weakestKeys) {
    console.log(`  ${item.key}: ${item.count}`);
  }
  console.log("Weakest bigrams:");
  for (const item of insights.weakestBigrams) {
    console.log(`  ${item.bigram}: ${item.count}`);
  }
}
