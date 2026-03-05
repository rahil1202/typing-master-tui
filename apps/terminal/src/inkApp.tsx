import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { ProgressBar, Spinner } from "@inkjs/ui";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { getDifficultyConfig, getLessonsForDifficulty, makeWordTest, normalizeCustomText, pickQuote, type Difficulty } from "@typing-master/content";
import { Storage, type TrainingProgress } from "@typing-master/storage";
import { TypingSession, type RunMode } from "@typing-master/typing-engine";

type GameLevel = "very-easy" | "easy" | "medium" | "hard" | "expert" | "insane";
type View = "loading" | "menu" | "typing" | "result" | "stats" | "level" | "training";

interface ActiveRun {
  mode: RunMode;
  textId: string;
  difficulty: Difficulty;
  target: string;
  startedAt: number;
}

const MENU_ITEMS = [
  "Practice Training",
  "Lessons",
  "Typing Test",
  "Custom Test",
  "Stats",
  "Game Level",
  "Toggle Sound",
  "Toggle Keyboard",
  "Quit"
] as const;

const LEVELS: GameLevel[] = ["very-easy", "easy", "medium", "hard", "expert", "insane"];

export function runInkApp(dbPath: string): void {
  render(<InkTypingApp dbPath={dbPath} />);
}

function InkTypingApp({ dbPath }: { dbPath: string }): React.JSX.Element {
  const { exit } = useApp();
  const storage = useMemo(() => new Storage(dbPath), [dbPath]);
  const profile = useMemo(() => storage.getOrCreateProfile(os.userInfo().username || "Guest"), [storage]);

  const [settings, setSettings] = useState(() => {
    const s = storage.getSettings();
    const normalized = { ...s, strictMode: false };
    if (normalized.strictMode !== s.strictMode) storage.saveSettings(normalized);
    return normalized;
  });
  const [view, setView] = useState<View>("loading");
  const [loadingPct, setLoadingPct] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>("easy");
  const [selectedMenu, setSelectedMenu] = useState(0);
  const [levelCursor, setLevelCursor] = useState(LEVELS.indexOf("easy"));
  const [resultText, setResultText] = useState<string>("");
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgress>(() => storage.getTrainingProgress());

  const [run, setRun] = useState<ActiveRun | null>(null);
  const [typed, setTyped] = useState("");
  const [mistakes, setMistakes] = useState(0);
  const [correctChars, setCorrectChars] = useState(0);

  const sessionRef = useRef<TypingSession | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setLoadingPct((p) => {
        const next = Math.min(100, p + 7);
        if (next >= 100) {
          clearInterval(timer);
          setTimeout(() => setView("menu"), 150);
        }
        return next;
      });
    }, 90);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => storage.close(), [storage]);

  const getLevelProfile = (level: GameLevel): { difficulty: Difficulty; extraWords: number; label: string } => {
    switch (level) {
      case "very-easy":
        return { difficulty: "beginner", extraWords: -6, label: "Very Easy" };
      case "easy":
        return { difficulty: "beginner", extraWords: 0, label: "Easy" };
      case "medium":
        return { difficulty: "intermediate", extraWords: 0, label: "Medium" };
      case "hard":
        return { difficulty: "advanced", extraWords: 4, label: "Hard" };
      case "expert":
        return { difficulty: "expert", extraWords: 0, label: "Expert" };
      default:
        return { difficulty: "expert", extraWords: 10, label: "Insane" };
    }
  };

  const liveMetrics = useMemo(() => {
    if (!run) return { wpm: 0, acc: 0, progress: 0 };
    const elapsed = Math.max(1, Date.now() - run.startedAt);
    const min = elapsed / 60000;
    const gross = (typed.length / 5) / min;
    const net = Math.max(0, gross - mistakes / min / 5);
    const acc = (correctChars / Math.max(1, typed.length)) * 100;
    const progress = Math.floor((typed.length / Math.max(1, run.target.length)) * 100);
    return { wpm: round2(net), acc: round2(acc), progress };
  }, [run, typed.length, mistakes, correctChars]);

  const targetView = useMemo(() => {
    if (!run) return "";
    return run.target;
  }, [run]);

  const outputColorChunks = useMemo(() => {
    if (!run || !typed) return [] as Array<{ char: string; ok: boolean }>;
    const out: Array<{ char: string; ok: boolean }> = [];
    for (let i = 0; i < typed.length; i++) {
      out.push({ char: typed[i], ok: typed[i] === run.target[i] });
    }
    return out;
  }, [run, typed]);

  const startRun = (mode: RunMode, text: string, textId: string, difficulty: Difficulty): void => {
    sessionRef.current = new TypingSession(text, false);
    setRun({ mode, target: text, textId, difficulty, startedAt: Date.now() });
    setTyped("");
    setMistakes(0);
    setCorrectChars(0);
    if (settings.sound) playStartSound();
    setView("typing");
  };

  const finishRun = (training = false): void => {
    if (!run || !sessionRef.current) return;
    const result = sessionRef.current.finalize(run.mode, run.textId, Date.now());
    storage.addRun(result);
    if (training) {
      const next = storage.recordTrainingRun(result);
      setTrainingProgress(next);
    }
    if (settings.sound) playEndSound();
    setResultText(
      `Run Complete\nNet WPM: ${result.netWpm}\nAccuracy: ${result.accuracy}%\nMistakes: ${result.mistakes}`
    );
    setRun(null);
    sessionRef.current = null;
    setView("result");
  };

  const openTraining = (): void => {
    setTrainingProgress(storage.getTrainingProgress());
    setView("training");
  };

  const startTrainingDrill = (): void => {
    const current = storage.getTrainingProgress();
    const tierDifficulty: Record<TrainingProgress["tier"], Difficulty> = {
      rookie: "beginner",
      cadet: "intermediate",
      pro: "advanced",
      elite: "expert",
      master: "expert"
    };
    const diff = tierDifficulty[current.tier];
    const pool = getLessonsForDifficulty(diff);
    const lesson = pool[current.completedDrills % Math.max(1, pool.length)] ?? pool[0];
    if (!lesson) return;
    startRun("lesson", lesson.text, `training-${lesson.id}-${Date.now()}`, lesson.level);
  };

  const onMenuSelect = (index: number): void => {
    const item = MENU_ITEMS[index];
    switch (item) {
      case "Practice Training":
        openTraining();
        break;
      case "Lessons": {
        const lessons = getLessonsForDifficulty(getLevelProfile(selectedLevel).difficulty);
        const lesson = lessons[0];
        if (!lesson) return;
        startRun("lesson", lesson.text, lesson.id, lesson.level);
        break;
      }
      case "Typing Test": {
        const profile = getLevelProfile(selectedLevel);
        const cfg = getDifficultyConfig(profile.difficulty);
        const count = Math.max(12, cfg.wordCount + profile.extraWords);
        const text = makeWordTest(count, Math.floor(Date.now() / 1000) + cfg.seedOffset);
        startRun("test", text, `words-${selectedLevel}-${Date.now()}`, profile.difficulty);
        break;
      }
      case "Custom Test": {
        const profile = getLevelProfile(selectedLevel);
        const cfg = getDifficultyConfig(profile.difficulty);
        const imported = path.join(os.homedir(), ".typing-master", "last-import.txt");
        let text = "paste custom text by running `typing-master import <file>` first";
        if (fs.existsSync(imported)) text = fs.readFileSync(imported, "utf8");
        text = normalizeCustomText(text, cfg.custom);
        if (!text) text = pickQuote();
        startRun("custom", text, `custom-${selectedLevel}-${Date.now()}`, profile.difficulty);
        break;
      }
      case "Stats":
        setView("stats");
        break;
      case "Game Level":
        setLevelCursor(LEVELS.indexOf(selectedLevel));
        setView("level");
        break;
      case "Toggle Sound": {
        const next = { ...settings, sound: !settings.sound };
        setSettings(next);
        storage.saveSettings(next);
        break;
      }
      case "Toggle Keyboard": {
        const next = { ...settings, showKeyboard: !settings.showKeyboard };
        setSettings(next);
        storage.saveSettings(next);
        break;
      }
      default:
        exit();
    }
  };

  useInput((input, key) => {
    if (view === "loading") return;

    if (view === "menu") {
      if (key.upArrow) setSelectedMenu((i) => (i <= 0 ? MENU_ITEMS.length - 1 : i - 1));
      else if (key.downArrow) setSelectedMenu((i) => (i + 1) % MENU_ITEMS.length);
      else if (key.return) onMenuSelect(selectedMenu);
      return;
    }

    if (view === "level") {
      if (key.escape) {
        setView("menu");
        return;
      }
      if (key.upArrow) setLevelCursor((i) => (i <= 0 ? LEVELS.length - 1 : i - 1));
      else if (key.downArrow) setLevelCursor((i) => (i + 1) % LEVELS.length);
      else if (key.return) {
        setSelectedLevel(LEVELS[levelCursor]);
        setView("menu");
      }
      return;
    }

    if (view === "stats" || view === "result" || view === "training") {
      if (view === "training" && key.return) {
        startTrainingDrill();
        return;
      }
      setView("menu");
      return;
    }

    if (view === "typing") {
      if (key.escape) {
        sessionRef.current = null;
        setRun(null);
        setView("menu");
        return;
      }
      if (key.backspace || key.delete) {
        sessionRef.current?.applyKey("\b");
      } else if (input && input.length === 1) {
        const idx = sessionRef.current?.snapshot.cursor ?? 0;
        const expected = run?.target[idx] ?? "";
        const correct = input === expected;
        sessionRef.current?.applyKey(input);
        if (!correct && settings.sound) playWrongSound();
      } else {
        return;
      }

      const snap = sessionRef.current?.snapshot;
      if (!snap) return;
      setTyped(snap.typed);
      setMistakes(snap.mistakes);
      setCorrectChars(snap.correctChars);
      if (snap.done) finishRun(run?.textId.startsWith("training-") ?? false);
    }
  });

  const stats = storage.getStats90d();

  if (view === "loading") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyanBright">Typing Master</Text>
        <Spinner label="Building aesthetic terminal UI..." />
        <Box marginTop={1}>
          <ProgressBar value={loadingPct} />
        </Box>
      </Box>
    );
  }

  if (view === "typing" && run) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>
          <Text color="yellow">Typing Master</Text> · {profile.nickname} · {selectedLevel.toUpperCase()}
        </Text>
        <Text>
          <Text color="green">{liveMetrics.wpm} WPM</Text>  <Text color="yellow">{liveMetrics.acc}% ACC</Text>  <Text color="red">{mistakes} ERR</Text>  <Text color="cyan">{liveMetrics.progress}%</Text>
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Text color="yellowBright">Input Text (target)</Text>
          <Text color="yellow">{targetView}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color="white">Output</Text>
          <Text>
            {outputColorChunks.length === 0 && <Text color="gray">(start typing...)</Text>}
            {outputColorChunks.map((c, i) => (
              <Text key={i} color={c.ok ? "green" : "red"}>
                {c.char}
              </Text>
            ))}
          </Text>
        </Box>

        {settings.showKeyboard && (
          <Box marginTop={1} flexDirection="column">
            <Text color="cyan">Keyboard View Enabled</Text>
            <Text color="gray">(Press F2 in Blessed mode for detailed keycaps)</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color="gray">ESC to exit run</Text>
        </Box>
      </Box>
    );
  }

  if (view === "stats") {
    const runs = storage.getRuns(8);
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyanBright">Stats</Text>
        <Text color="green">Best: {stats.bestWpm} WPM</Text>
        <Text color="yellow">Average: {stats.avgWpm} WPM</Text>
        <Text color="magenta">Accuracy: {stats.avgAccuracy}%</Text>
        <Text color="blue">Consistency: {stats.consistency}</Text>
        <Text color="gray">Recent Runs:</Text>
        {runs.map((r, i) => (
          <Text key={i}>#{i + 1} {r.netWpm} WPM · {r.accuracy}%</Text>
        ))}
        <Text color="gray">Press any key to return</Text>
      </Box>
    );
  }

  if (view === "level") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyanBright">Select Level</Text>
        {LEVELS.map((l, i) => (
          <Text key={l} color={i === levelCursor ? "black" : "white"} backgroundColor={i === levelCursor ? "cyan" : undefined}>
            {i === levelCursor ? "▶ " : "  "}
            {l.toUpperCase()}
          </Text>
        ))}
        <Text color="gray">Enter to apply · Esc to cancel</Text>
      </Box>
    );
  }

  if (view === "training") {
    const tier = trainingProgress.tier.toUpperCase();
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyanBright">Practice Training: 0 to Best</Text>
        <Text color="yellow">Tier: {tier}</Text>
        <Text color="green">Points: {trainingProgress.points}</Text>
        <Text>Drills: {trainingProgress.completedDrills}</Text>
        <Text>Best WPM: {trainingProgress.bestWpm}</Text>
        <Text>Best Accuracy: {trainingProgress.bestAccuracy}%</Text>
        <Text color="gray">Press Enter to start guided drill · Any other key to go back</Text>
      </Box>
    );
  }

  if (view === "result") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="greenBright">{resultText}</Text>
        <Text color="gray">Press any key to continue</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text>
        <Text color="yellow">Typing Master (Ink UI)</Text> · {profile.nickname} · {selectedLevel.toUpperCase()}
      </Text>
      <Text>
        <Text color="green">Best {stats.bestWpm} WPM</Text>  <Text color="yellow">Acc {stats.avgAccuracy}%</Text>  Sound:{settings.sound ? "ON" : "OFF"}  Keyboard:{settings.showKeyboard ? "ON" : "OFF"}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {MENU_ITEMS.map((item, i) => (
          <Text key={item} color={i === selectedMenu ? "black" : "white"} backgroundColor={i === selectedMenu ? "cyan" : undefined}>
            {i === selectedMenu ? "▶ " : "  "}
            {item}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Arrow keys + Enter</Text>
      </Box>
    </Box>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function playWrongSound(): void {
  process.stdout.write("\u0007");
  setTimeout(() => process.stdout.write("\u0007"), 45);
}

function playStartSound(): void {
  process.stdout.write("\u0007");
}

function playEndSound(): void {
  process.stdout.write("\u0007");
  setTimeout(() => process.stdout.write("\u0007"), 70);
}
