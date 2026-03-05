import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Storage } from "../src/index.js";

describe("Storage", () => {
  it("persists and aggregates run stats", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "typing-master-"));
    const dbPath = path.join(dir, "test.db");
    const s = new Storage(dbPath);
    s.addRun({
      mode: "test",
      startedAt: new Date().toISOString(),
      durationMs: 60_000,
      grossWpm: 50,
      netWpm: 45,
      accuracy: 98,
      cpm: 250,
      mistakes: 2,
      textId: "x",
      inputTraceHash: "abc"
    });
    const stats = s.getStats90d();
    expect(stats.totalRuns).toBe(1);
    expect(stats.bestWpm).toBe(45);
    s.close();
  });
});
