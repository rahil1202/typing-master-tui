import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Pool } from "pg";
import { makeWordTest } from "@typing-master/content";
import type { ClientEvent, RaceFinishEvent, RaceProgressEvent, ServerEvent } from "@typing-master/protocol";

const app = express();
app.use(express.json());

const port = Number(process.env.PORT ?? 8080);
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/typing_master" });
let useMemoryStore = false;
const memoryLeaderboard: Array<{ nickname: string; netWpm: number; accuracy: number; createdAt: Date }> = [];

async function initDb(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_runs (
        id BIGSERIAL PRIMARY KEY,
        nickname TEXT NOT NULL,
        net_wpm REAL NOT NULL,
        accuracy REAL NOT NULL,
        mode TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch {
    useMemoryStore = true;
    console.warn("Postgres unavailable. Falling back to in-memory leaderboard store.");
  }
}

async function insertLeaderboardRun(nickname: string, netWpm: number, accuracy: number): Promise<void> {
  if (useMemoryStore) {
    memoryLeaderboard.push({ nickname, netWpm, accuracy, createdAt: new Date() });
    return;
  }
  await pool.query("INSERT INTO leaderboard_runs(nickname, net_wpm, accuracy, mode) VALUES ($1, $2, $3, 'race')", [
    nickname,
    netWpm,
    accuracy
  ]);
}

async function getLeaderboard(period: "daily" | "weekly"): Promise<Array<{ nickname: string; best_wpm: number; best_accuracy: number }>> {
  if (useMemoryStore) {
    const from = Date.now() - (period === "weekly" ? 7 : 1) * 24 * 60 * 60 * 1000;
    const grouped = new Map<string, { best_wpm: number; best_accuracy: number }>();
    for (const row of memoryLeaderboard) {
      if (row.createdAt.getTime() < from) continue;
      const prev = grouped.get(row.nickname) ?? { best_wpm: 0, best_accuracy: 0 };
      grouped.set(row.nickname, {
        best_wpm: Math.max(prev.best_wpm, row.netWpm),
        best_accuracy: Math.max(prev.best_accuracy, row.accuracy)
      });
    }
    return [...grouped.entries()]
      .map(([nickname, vals]) => ({ nickname, ...vals }))
      .sort((a, b) => b.best_wpm - a.best_wpm)
      .slice(0, 50);
  }

  const periodInterval = period === "weekly" ? "7 days" : "1 day";
  const rows = await pool.query(
    `SELECT nickname, MAX(net_wpm) AS best_wpm, MAX(accuracy) AS best_accuracy
     FROM leaderboard_runs
     WHERE created_at >= NOW() - $1::interval
     GROUP BY nickname
     ORDER BY best_wpm DESC
     LIMIT 50`,
    [periodInterval]
  );
  return rows.rows;
}

async function pruneRetention(): Promise<number> {
  if (useMemoryStore) {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const before = memoryLeaderboard.length;
    for (let i = memoryLeaderboard.length - 1; i >= 0; i--) {
      if (memoryLeaderboard[i].createdAt.getTime() < cutoff) memoryLeaderboard.splice(i, 1);
    }
    return before - memoryLeaderboard.length;
  }
  const result = await pool.query("DELETE FROM leaderboard_runs WHERE created_at < NOW() - INTERVAL '90 days'");
  return result.rowCount ?? 0;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/leaderboard", async (req, res) => {
  const period = req.query.period === "weekly" ? "weekly" : "daily";
  const rows = await getLeaderboard(period);
  res.json(rows);
});

app.post("/retention/prune", async (_req, res) => {
  const deleted = await pruneRetention();
  res.json({ deleted });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

interface QueuePlayer {
  ws: WebSocket;
  nickname: string;
}

interface RaceState {
  id: string;
  target: string;
  textId: string;
  players: QueuePlayer[];
  progress: Map<string, number>;
  finished: Array<{ nickname: string; netWpm: number; accuracy: number }>;
}

const queue: QueuePlayer[] = [];
const races = new Map<string, RaceState>();
const MIN_PLAYERS = 2;

function broadcast(players: QueuePlayer[], event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const p of players) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(payload);
  }
}

function createRace(players: QueuePlayer[]): RaceState {
  const raceId = randomUUID();
  const target = makeWordTest(30, Date.now());
  const race: RaceState = {
    id: raceId,
    target,
    textId: `race-${Date.now()}`,
    players,
    progress: new Map(),
    finished: []
  };
  races.set(raceId, race);
  return race;
}

function matchmake(): void {
  while (queue.length >= MIN_PLAYERS) {
    const players = queue.splice(0, MIN_PLAYERS);
    const race = createRace(players);
    broadcast(players, {
      type: "queue.matched",
      raceId: race.id,
      textId: race.textId,
      target: race.target,
      players: players.map((p) => p.nickname)
    });

    broadcast(players, { type: "race.countdown", raceId: race.id, startsInMs: 3000 });
    setTimeout(() => {
      broadcast(players, { type: "race.start", raceId: race.id, startedAt: Date.now() });
    }, 3000);
  }
}

function findRaceByNickname(nickname: string): RaceState | undefined {
  for (const race of races.values()) {
    if (race.players.some((p) => p.nickname === nickname)) return race;
  }
  return undefined;
}

wss.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    let event: ClientEvent;
    try {
      event = JSON.parse(raw.toString()) as ClientEvent;
    } catch {
      ws.send(JSON.stringify({ type: "race.error", message: "invalid payload" }));
      return;
    }

    if (event.type === "queue.join") {
      queue.push({ ws, nickname: event.nickname });
      matchmake();
      return;
    }

    if (event.type === "race.progress") {
      const e = event as RaceProgressEvent;
      const race = races.get(e.raceId) ?? findRaceByNickname(e.nickname);
      if (!race) return;
      race.progress.set(e.nickname, e.progress);
      broadcast(race.players, event);
      return;
    }

    if (event.type === "race.finish") {
      const e = event as RaceFinishEvent;
      const race = races.get(e.raceId) ?? findRaceByNickname(e.nickname);
      if (!race) return;

      if (e.netWpm > 260 || e.accuracy < 40) {
        ws.send(JSON.stringify({ type: "race.error", message: "anti-cheat rejection" }));
        return;
      }

      race.finished.push({ nickname: e.nickname, netWpm: e.netWpm, accuracy: e.accuracy });
      await insertLeaderboardRun(e.nickname, e.netWpm, e.accuracy);

      if (race.finished.length >= race.players.length) {
        race.finished.sort((a, b) => b.netWpm - a.netWpm || b.accuracy - a.accuracy);
        broadcast(race.players, {
          type: "race.result",
          raceId: race.id,
          standings: race.finished.map((f, idx) => ({ ...f, place: idx + 1 }))
        });
        races.delete(race.id);
      }
    }
  });

  ws.on("close", () => {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].ws === ws) queue.splice(i, 1);
    }
  });
});

initDb()
  .then(() => {
    server.listen(port, () => {
      console.log(`race-server listening on ${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
