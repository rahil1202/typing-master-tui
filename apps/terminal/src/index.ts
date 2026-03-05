#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { Storage } from "@typing-master/storage";
import type { ClientEvent, ServerEvent } from "@typing-master/protocol";
import { runTui } from "./tui.js";
import { runInkApp } from "./inkApp.js";

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
    const text = storage.importCustomText(path.resolve(file));
    const outPath = path.join(os.homedir(), ".typing-master", "last-import.txt");
    fs.writeFileSync(outPath, text, "utf8");
    storage.close();
    console.log(`Imported ${text.length} chars to ${outPath}`);
  });

program
  .command("export")
  .option("--format <format>", "json or csv", "json")
  .description("Export run history")
  .action((opts: { format: "json" | "csv" }) => {
    const storage = new Storage(getDbPath());
    const out = storage.exportRuns(opts.format);
    const outPath = path.join(os.homedir(), ".typing-master", `runs-export.${opts.format}`);
    fs.writeFileSync(outPath, out, "utf8");
    storage.close();
    console.log(`Exported to ${outPath}`);
  });

program
  .command("race")
  .requiredOption("--nickname <name>")
  .option("--server <url>", "race server ws url", "ws://localhost:8080")
  .description("Join multiplayer race queue")
  .action((opts: { nickname: string; server: string }) => {
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
  .description("Launch Ink UI (new)")
  .action(() => {
    runInkApp(getDbPath());
  });

program
  .command("play-blessed")
  .description("Launch legacy Blessed TUI")
  .action(() => {
    runTui(getDbPath());
  });

program.parse(process.argv);
