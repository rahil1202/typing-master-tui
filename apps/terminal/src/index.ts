#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Storage } from "./core/storage.js";
import type { ClientEvent, ServerEvent } from "./core/protocol.js";

const program = new Command();
program.name("typing-master").description("Terminal Typing Master clone");

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
  .command("play", { isDefault: true })
  .description("Launch full-screen TUI (recommended)")
  .action(async () => {
    const { runTui } = await import("./tui.js");
    runTui(getDbPath());
  });

program
  .command("play-ink")
  .description("Launch Ink UI (line-based)")
  .action(async () => {
    const { runInkApp } = await import("./inkApp.js");
    runInkApp(getDbPath());
  });

program.parse(process.argv);
