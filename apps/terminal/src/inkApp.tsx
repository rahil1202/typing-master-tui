import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { ProgressBar, Spinner } from "@inkjs/ui";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  buildCustomModeText,
  getCustomModeOptions,
  getDifficultyConfig,
  getLessonsForDifficulty,
  makeParagraphTest,
  type CustomMode,
  type Difficulty
} from "./core/content.js";
import { Storage, type TrainingProgress } from "./core/storage.js";
import { TypingSession, type RunMode } from "./core/typingEngine.js";

type GameLevel =
  | "rookie"
  | "very-easy"
  | "easy"
  | "medium"
  | "challenging"
  | "hard"
  | "expert"
  | "master"
  | "insane"
  | "legend";
type View = "loading" | "menu" | "typing" | "result" | "stats" | "level" | "training" | "custom-mode";

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

const LEVELS: GameLevel[] = ["rookie", "very-easy", "easy", "medium", "challenging", "hard", "expert", "master", "insane", "legend"];
const CUSTOM_MODES = getCustomModeOptions();

function levelTone(level: GameLevel): "cyan" | "green" | "yellow" | "magenta" | "red" {
  switch (level) {
    case "rookie":
      return "cyan";
    case "very-easy":
      return "cyan";
    case "easy":
      return "green";
    case "medium":
      return "yellow";
    case "challenging":
      return "magenta";
    case "hard":
      return "magenta";
    case "expert":
      return "red";
    case "master":
      return "green";
    case "insane":
    case "legend":
      return "red";
    default:
      return "cyan";
  }
}

function levelDescription(level: GameLevel): string {
  switch (level) {
    case "rookie":
      return "first-day onboarding";
    case "very-easy":
      return "short, low-pressure onboarding";
    case "easy":
      return "steady foundation work";
    case "medium":
      return "balanced speed and control";
    case "challenging":
      return "pressure before hard mode";
    case "hard":
      return "stamina under pressure";
    case "expert":
      return "high-demand accuracy";
    case "master":
      return "long expert-length control";
    case "insane":
      return "maximum pressure runs";
    case "legend":
      return "endurance and density";
    default:
      return "general training";
  }
}

function previewText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function StatPill({
  label,
  value,
  color
}: {
  label: string;
  value: string;
  color: "cyan" | "green" | "yellow" | "magenta" | "red" | "blue";
}): React.JSX.Element {
  return (
    <Box marginRight={1}>
      <Text backgroundColor={color} color="black">
        {" "}{label}{" "}
      </Text>
      <Text> </Text>
      <Text color={color}>{value}</Text>
    </Box>
  );
}

function SectionCard({
  title,
  color,
  children
}: {
  title: string;
  color: "cyan" | "green" | "yellow" | "magenta" | "red" | "blue" | "white";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} paddingY={0} marginBottom={1}>
      <Text color={color}>{title}</Text>
      {children}
    </Box>
  );
}

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
  const [customModeCursor, setCustomModeCursor] = useState(0);
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
      case "rookie":
        return { difficulty: "beginner", extraWords: -10, label: "Rookie" };
      case "very-easy":
        return { difficulty: "beginner", extraWords: -6, label: "Very Easy" };
      case "easy":
        return { difficulty: "beginner", extraWords: 0, label: "Easy" };
      case "medium":
        return { difficulty: "intermediate", extraWords: 0, label: "Medium" };
      case "challenging":
        return { difficulty: "intermediate", extraWords: 8, label: "Challenging" };
      case "hard":
        return { difficulty: "advanced", extraWords: 4, label: "Hard" };
      case "expert":
        return { difficulty: "expert", extraWords: 0, label: "Expert" };
      case "master":
        return { difficulty: "expert", extraWords: 10, label: "Master" };
      case "insane":
        return { difficulty: "expert", extraWords: 18, label: "Insane" };
      default:
        return { difficulty: "expert", extraWords: 26, label: "Legend" };
    }
  };

  const readImportedCustomText = (): string => {
    const imported = path.join(os.homedir(), ".typing-master", "last-import.txt");
    if (!fs.existsSync(imported)) return "";
    return fs.readFileSync(imported, "utf8");
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
        const flavor = (Date.now() + cfg.seedOffset) % 2 === 0 ? "mixed" : "story";
        const text = makeParagraphTest(profile.difficulty, count, Math.floor(Date.now() / 1000) + cfg.seedOffset, flavor);
        startRun("test", text, `paragraph-${selectedLevel}-${Date.now()}`, profile.difficulty);
        break;
      }
      case "Custom Test":
        setCustomModeCursor(0);
        setView("custom-mode");
        break;
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

    if (view === "custom-mode") {
      if (key.escape) {
        setView("menu");
        return;
      }
      if (key.upArrow) setCustomModeCursor((i) => (i <= 0 ? CUSTOM_MODES.length - 1 : i - 1));
      else if (key.downArrow) setCustomModeCursor((i) => (i + 1) % CUSTOM_MODES.length);
      else if (key.return) {
        const picked = CUSTOM_MODES[customModeCursor];
        if (!picked) return;
        const profile = getLevelProfile(selectedLevel);
        const built = buildCustomModeText(picked.id, profile.difficulty, Date.now(), readImportedCustomText());
        startRun("custom", built.text, built.textId, profile.difficulty);
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
  const recentRuns = storage.getRuns(6);
  const activeTone = levelTone(selectedLevel);
  const nextLesson = getLessonsForDifficulty(getLevelProfile(selectedLevel).difficulty)[0];

  if (view === "loading") {
    return (
      <Box flexDirection="column" padding={1}>
        <SectionCard title="ARCADE TERMINAL" color="cyan">
          <Text color="cyanBright">Typing Master</Text>
          <Text color="gray">Preparing the fallback UI with the same training flow.</Text>
        </SectionCard>
        <Spinner label="Building interface..." />
        <Box marginTop={1}>
          <ProgressBar value={loadingPct} />
        </Box>
      </Box>
    );
  }

  if (view === "typing" && run) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <SectionCard title={`${run.mode.toUpperCase()} RUN`} color={activeTone}>
          <Text color={activeTone}>Typing Master · {profile.nickname} · {getLevelProfile(selectedLevel).label}</Text>
          <Box marginTop={1}>
            <StatPill label="WPM" value={String(liveMetrics.wpm)} color="green" />
            <StatPill label="ACC" value={`${liveMetrics.acc}%`} color="yellow" />
            <StatPill label="ERR" value={String(mistakes)} color={mistakes > 0 ? "red" : "blue"} />
            <StatPill label="FLOW" value={`${liveMetrics.progress}%`} color={activeTone === "red" ? "magenta" : "cyan"} />
          </Box>
        </SectionCard>

        <SectionCard title="READ LANE" color="yellow">
          <Text color="yellow">{targetView}</Text>
        </SectionCard>

        <SectionCard title="TYPE LANE" color={mistakes > 0 ? "red" : "green"}>
          <Text>
            {outputColorChunks.length === 0 && <Text color="gray">(start typing...)</Text>}
            {outputColorChunks.map((c, i) => (
              <Text key={i} color={c.ok ? "green" : "red"}>
                {c.char}
              </Text>
            ))}
          </Text>
        </SectionCard>

        <SectionCard title="FOCUS" color="blue">
          <Text color="gray">Keep your eyes on the read lane. Flow mode keeps the run moving even on mistakes.</Text>
          <Text color="gray">ESC exits the run.</Text>
          {settings.showKeyboard && <Text color="cyan">Keyboard overlay is richer in Blessed mode.</Text>}
        </SectionCard>
      </Box>
    );
  }

  if (view === "stats") {
    const runs = storage.getRuns(8);
    return (
      <Box flexDirection="column" padding={1}>
        <SectionCard title="PERFORMANCE BOARD" color="cyan">
          <Box>
            <StatPill label="BEST" value={`${stats.bestWpm} WPM`} color="green" />
            <StatPill label="AVG" value={`${stats.avgWpm} WPM`} color="yellow" />
            <StatPill label="ACC" value={`${stats.avgAccuracy}%`} color="magenta" />
            <StatPill label="CONS" value={String(stats.consistency)} color="blue" />
          </Box>
        </SectionCard>
        <SectionCard title="RECENT RUNS" color="white">
          {runs.map((r, i) => (
            <Text key={i}>
              #{i + 1} {r.mode.toUpperCase()} · {r.netWpm} WPM · {r.accuracy}% · {r.mistakes} err
            </Text>
          ))}
          {runs.length === 0 && <Text color="gray">No run history yet.</Text>}
          <Text color="gray">Press any key to return.</Text>
        </SectionCard>
      </Box>
    );
  }

  if (view === "level") {
    return (
      <Box flexDirection="column" padding={1}>
        <SectionCard title="LEVEL SELECT" color={activeTone}>
          <Text color={activeTone}>Choose the pressure profile for lessons and tests.</Text>
          {LEVELS.map((l, i) => (
            <Text key={l} color={i === levelCursor ? "black" : "white"} backgroundColor={i === levelCursor ? levelTone(l) : undefined}>
              {i === levelCursor ? "▶ " : "  "}
              {l.toUpperCase()}  · {levelDescription(l)}
            </Text>
          ))}
          <Text color="gray">Enter applies the highlighted level. Esc cancels.</Text>
        </SectionCard>
      </Box>
    );
  }

  if (view === "custom-mode") {
    const picked = CUSTOM_MODES[customModeCursor];
    const built = picked
      ? buildCustomModeText(picked.id, getLevelProfile(selectedLevel).difficulty, 12345, readImportedCustomText())
      : null;
    return (
      <Box flexDirection="column" padding={1}>
        <SectionCard title="CUSTOM TEST TYPES" color={activeTone}>
          <Text color={activeTone}>Choose the kind of content you want to type.</Text>
          {CUSTOM_MODES.map((mode, i) => (
            <Text key={mode.id} color={i === customModeCursor ? "black" : "white"} backgroundColor={i === customModeCursor ? activeTone : undefined}>
              {i === customModeCursor ? "▶ " : "  "}
              {mode.label} · {mode.description}
            </Text>
          ))}
        </SectionCard>
        <SectionCard title="PREVIEW" color="yellow">
          <Text>{picked?.label}</Text>
          <Text color="gray">{picked?.description}</Text>
          <Text>{previewText(built?.text ?? "", 220)}</Text>
          <Text color="gray">Enter starts the selected mode. Esc cancels.</Text>
        </SectionCard>
      </Box>
    );
  }

  if (view === "training") {
    const tier = trainingProgress.tier.toUpperCase();
    return (
      <Box flexDirection="column" padding={1}>
        <SectionCard title="0 TO BEST PROGRAM" color="cyan">
          <Box>
            <StatPill label="TIER" value={tier} color={activeTone === "red" ? "magenta" : "cyan"} />
            <StatPill label="PTS" value={String(trainingProgress.points)} color="green" />
            <StatPill label="DRILLS" value={String(trainingProgress.completedDrills)} color="yellow" />
          </Box>
          <Text>Best WPM: {trainingProgress.bestWpm}</Text>
          <Text>Best Accuracy: {trainingProgress.bestAccuracy}%</Text>
          <Text>Recommended next lesson: {nextLesson ? nextLesson.title : "No lesson available"}</Text>
          <Text color="gray">Press Enter to start the guided drill. Any other key returns.</Text>
        </SectionCard>
      </Box>
    );
  }

  if (view === "result") {
    return (
      <Box flexDirection="column" padding={1}>
        <SectionCard title="RUN COMPLETE" color="green">
          <Text color="greenBright">{resultText}</Text>
          <Text color="gray">Press any key to continue.</Text>
        </SectionCard>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <SectionCard title="MISSION CONTROL" color={activeTone}>
        <Text color={activeTone}>Typing Master (Ink UI) · {profile.nickname} · {getLevelProfile(selectedLevel).label}</Text>
        <Text color="gray">Fallback interface with the same flow-first game loop.</Text>
        <Box marginTop={1}>
          <StatPill label="BEST" value={`${stats.bestWpm} WPM`} color="green" />
          <StatPill label="ACC" value={`${stats.avgAccuracy}%`} color="yellow" />
          <StatPill label="RUNS" value={String(stats.totalRuns)} color="blue" />
        </Box>
      </SectionCard>
      <SectionCard title="MODE DECK" color="cyan">
        {MENU_ITEMS.map((item, i) => (
          <Text key={item} color={i === selectedMenu ? "black" : "white"} backgroundColor={i === selectedMenu ? activeTone : undefined}>
            {i === selectedMenu ? "▶ " : "  "}
            {item}
          </Text>
        ))}
      </SectionCard>
      <SectionCard title="TODAY" color="white">
        <Text>Next lesson: {nextLesson ? nextLesson.title : "No lesson available"}</Text>
        <Text>Recent sessions logged: {recentRuns.length}</Text>
        <Text>Current level focus: {levelDescription(selectedLevel)}</Text>
        <Text color="gray">Arrow keys move. Enter launches.</Text>
      </SectionCard>
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
