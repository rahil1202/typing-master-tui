import blessed from "blessed";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import spinners from "cli-spinners";
import gradient from "gradient-string";
import stringWidth from "string-width";
import { initLip, Lipgloss } from "charsm";
import {
  buildCustomModeText,
  composeAdaptiveDrill,
  getCustomModeOptions,
  getDifficultyConfig,
  getLessonsForDifficulty,
  makeParagraphTest,
  type CustomMode,
  type Difficulty,
  type Lesson
} from "./core/content.js";
import type { RunResult } from "./core/typingEngine.js";
import { Storage, type TrainingProgress } from "./core/storage.js";
import { TypingSession } from "./core/typingEngine.js";
import { detectTerminalHost, DiagnosticsLogger, PerfTracker, runDoctor } from "./core/diagnostics.js";

const THEME = {
  bg: "black",
  panel: "black",
  text: "white",
  muted: "gray",
  brand: "cyan",
  accent: "yellow",
  accentSoft: "blue",
  ok: "green",
  bad: "red",
  info: "magenta",
  borderPrimary: "cyan",
  borderSecondary: "magenta",
  borderMuted: "gray"
} as const;

const UI = {
  viewportChars: 210,
  liveTickerMs: 100,
  transitionInMs: 380,
  transitionOutMs: 320,
  toastMs: 1400
} as const;

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

const LEVELS: GameLevel[] = [
  "rookie",
  "very-easy",
  "easy",
  "medium",
  "challenging",
  "hard",
  "expert",
  "master",
  "insane",
  "legend"
];

let lip: Lipgloss | null = null;
let lipInitStarted = false;

function ensureLipInit(): void {
  if (lipInitStarted) return;
  lipInitStarted = true;
  void initLip().then((ok) => {
    if (!ok) return;
    lip = new Lipgloss();
    lip.createStyle({
      id: "splash",
      canvasColor: { color: "#f8fafc", background: "#0b1220" },
      border: { type: "rounded", foreground: "#22d3ee", sides: [true] },
      padding: [1, 2, 1, 2],
      margin: [0],
      bold: true
    });
    lip.createStyle({
      id: "result",
      canvasColor: { color: "#e2e8f0", background: "#102133" },
      border: { type: "rounded", foreground: "#22c55e", sides: [true] },
      padding: [1, 2, 1, 2],
      margin: [0],
      bold: true
    });
  }).catch(() => {
    lip = null;
  });
}

export function runTui(dbPath: string, options?: { perfHud?: boolean }): void {
  ensureLipInit();
  const storage = new Storage(dbPath);
  const profile = storage.getOrCreateProfile(os.userInfo().username || "Guest");
  storage.pruneHistory();

  let settings = storage.getSettings();
  // Requested game behavior: always flow forward on mistakes.
  if (settings.strictMode) {
    settings = { ...settings, strictMode: false };
    storage.saveSettings(settings);
  }

  let selectedLevel: GameLevel = "easy";
  const perf = new PerfTracker();
  const logger = new DiagnosticsLogger(settings.diagnosticsEnabled);
  const forcedPerfHud = Boolean(options?.perfHud);

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

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    mouse: true,
    title: "Typing Master Terminal"
  });

  try {
    screen.program.enableMouse();
    // allMotion:false on all platforms — motion-tracking floods the event queue and lags input
    screen.program.setMouse(
      { allMotion: false, vt200Mouse: true, x10Mouse: true, sgrMouse: true, sendFocus: false },
      true
    );
  } catch {
    // Keep app usable even when host terminal mouse tracking is limited.
  }

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: THEME.bg, fg: THEME.brand, bold: true }
  });

  const statsBar = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: THEME.bg, fg: THEME.text }
  });

  const menu = blessed.list({
    parent: screen,
    top: 2,
    left: 0,
    width: "26%",
    height: "100%-3",
    label: " Launch Deck ",
    tags: true,
    border: "line",
    keys: true,
    vi: true,
    mouse: true,
    style: {
      border: { fg: THEME.borderSecondary },
      item: { fg: THEME.text },
      selected: { bg: THEME.brand, fg: "black", bold: true },
      hover: { bg: THEME.accentSoft, fg: "white" }
    },
    items: []
  });

  const renderMenuItems = (): void => {
    menu.setItems([
      " 1  Training     ▸ guided climb",
      " 2  Lessons      ▸ technique reps",
      " 3  Typing Test  ▸ full run",
      " 4  Custom Test  ▸ imported text",
      " 5  Stats        ▸ board",
      " 6  Coach        ▸ mistake intel",
      ` 7  Level        ▸ ${getLevelProfile(selectedLevel).label}`,
      ` 8  Sound        ▸ ${settings.sound ? "ON" : "OFF"}`,
      ` 9  Keyboard     ▸ ${settings.showKeyboard ? "ON" : "OFF"}`,
      " 0  Quit"
    ]);
  };

  const panel = blessed.box({
    parent: screen,
    top: 2,
    left: "26%",
    width: "74%",
    height: "100%-3",
    label: " Mission Control ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    style: { border: { fg: THEME.borderPrimary }, fg: THEME.text, bg: THEME.panel },
    scrollbar: { ch: "█", style: { bg: THEME.brand } }
  });

  const resetPanel = (): void => {
    const children = [...panel.children];
    for (const child of children) child.destroy();
    panel.setScroll(0);
    prevPanelContent = "";
    panel.setContent("");
  };

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: THEME.bg, fg: THEME.muted },
    content: "  ↵ launch  ·  Click to launch  ·  ESC back  ·  Ctrl+P palette  ·  F2 keyboard  ·  F3 sound  ·  F12 reset  ·  Q quit  "
  });

  const toast = blessed.box({
    parent: screen,
    bottom: 1,
    left: "center",
    width: "shrink",
    height: 1,
    tags: true,
    hidden: true,
    border: "line",
    style: { bg: "black", fg: "yellow", bold: true, border: { fg: "yellow" } },
    content: ""
  });

  const perfHud = blessed.box({
    parent: screen,
    top: 2,
    right: 1,
    width: 30,
    height: 3,
    tags: true,
    hidden: !(forcedPerfHud || settings.performanceMode),
    border: "line",
    style: { border: { fg: THEME.borderSecondary }, fg: "white", bg: THEME.bg }
  });

  let toastTimer: NodeJS.Timeout | null = null;
  let prevPanelContent = "";
  let prevStatsContent = "";
  let prevHeaderContent = "";

  const setPanelContent = (next: string): void => {
    if (next === prevPanelContent) return;
    prevPanelContent = next;
    panel.setContent(next);
  };

  const setHeaderContent = (next: string): void => {
    if (next === prevHeaderContent) return;
    prevHeaderContent = next;
    header.setContent(next);
  };

  const setStatsContent = (next: string): void => {
    if (next === prevStatsContent) return;
    prevStatsContent = next;
    statsBar.setContent(next);
  };

  const showToast = (message: string): void => {
    if (settings.toastLevel === "off") return;
    toast.setContent(` ${message} `);
    toast.show();
    screen.render();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hide();
      screen.render();
    }, UI.toastMs);
  };

  const renderHeader = (): void => {
    const logo = gradient(["#22d3ee", "#38bdf8", "#a78bfa"])("Typing Master");
    const levelLabel = getLevelProfile(selectedLevel).label.toUpperCase();
    const motionLabel = settings.reducedMotion ? "Calm Motion" : "Arcade Motion";
    const raw = `${logo} · ${profile.nickname} · ${levelLabel} · ${motionLabel}`;
    const cols = typeof screen.width === "number" ? screen.width : 120;
    const clipped = clipAnsiAware(raw, Math.max(20, cols - 2));
    setHeaderContent(` ${clipped}`);
  };

  const renderIdleStats = (): void => {
    const s = storage.getStats90d();
    const training = storage.getTrainingProgress();
    const streak = computeCleanStreak(storage.getRuns(12));
    const levelTone = toneForLevel(selectedLevel);
    setStatsContent(
      ` ${renderPill("BEST", `${s.bestWpm} WPM`, THEME.ok)}  ` +
      `${renderPill("AVG", `${s.avgWpm} WPM`, THEME.accent)}  ` +
      `${renderPill("ACC", `${s.avgAccuracy}%`, THEME.info)}  ` +
      `{${THEME.muted}-fg}│{/${THEME.muted}-fg}  ` +
      `${renderPill("TIER", training.tier.toUpperCase(), levelTone)}  ` +
      `${renderPill("STREAK", String(streak), THEME.brand)}  ` +
      `{${THEME.muted}-fg}│{/${THEME.muted}-fg}  ` +
      `{${THEME.muted}-fg}Sound ${settings.sound ? "ON" : "OFF"} · Keyboard ${settings.showKeyboard ? "ON" : "OFF"}{/` +
      `${THEME.muted}-fg}`
    );
  };

  const renderLiveStats = (wpm: number, accuracy: number, mistakes: number, progress: number): void => {
    setStatsContent(
      ` ${renderPill("PACE", `${wpm} WPM`, THEME.ok)}  ` +
      `${renderPill("ACC", `${accuracy}%`, THEME.accent)}  ` +
      `${renderPill("ERR", String(mistakes), mistakes > 0 ? THEME.bad : THEME.brand)}  ` +
      `${renderPill("FLOW", `${progress}%`, toneForLevel(selectedLevel))}  ` +
      `{${THEME.muted}-fg}${getLevelProfile(selectedLevel).label} · ESC abort{/` +
      `${THEME.muted}-fg}`
    );
  };

  const renderHome = (): void => {
    resetPanel();
    renderMenuItems();
    panel.setLabel(" Mission Control ");
    const s = storage.getStats90d();
    const training = storage.getTrainingProgress();
    const coach = storage.getCoachInsights(24);
    const lessons = getLessonsForDifficulty(getLevelProfile(selectedLevel).difficulty);
    const nextLesson = lessons[0];
    const nextTierAt = trainingTierGoal(training.tier);
    const tierPct = training.tier === "master"
      ? 100
      : Math.min(100, Math.round((training.points / Math.max(1, nextTierAt)) * 100));
    const recentRuns = storage.getRuns(6);
    const streak = computeCleanStreak(recentRuns);
    setPanelContent(
      renderHero(
        "ARCADE TERMINAL",
        "Typing Master",
        "Fast visual feedback, guided practice, and clean progress tracking built for terminal flow.",
        toneForLevel(selectedLevel)
      ) +
      "\n\n" +
      renderCard(
        "Session Snapshot",
        `${renderPill("LEVEL", getLevelProfile(selectedLevel).label.toUpperCase(), toneForLevel(selectedLevel))}  ` +
        `${renderPill("BEST", `${s.bestWpm} WPM`, THEME.ok)}  ` +
        `${renderPill("AVG", `${s.avgWpm} WPM`, THEME.accent)}\n` +
        `${renderPill("ACC", `${s.avgAccuracy}%`, THEME.info)}  ` +
        `${renderPill("RUNS", String(s.totalRuns), THEME.brand)}  ` +
        `${renderPill("STREAK", `${streak} clean`, THEME.ok)}`
      ) +
      "\n\n" +
      renderCard(
        "Today's Flight Plan",
        `${renderProgressRow("Tier climb", training.points, nextTierAt, 24, toneForLevel(selectedLevel))}\n` +
        `Coach target: ${coach.dailyTarget}\n` +
        `Training tier: ${training.tier.toUpperCase()} · Best drill ${training.bestWpm} WPM @ ${training.bestAccuracy}%\n` +
        `Next lesson: ${nextLesson ? `${nextLesson.title} [${nextLesson.level}]` : "Waiting for content"}\n` +
        `Tier progress: ${tierPct}% ${training.tier === "master" ? "(maxed)" : `toward ${nextTierAt} pts`}`,
        THEME.accent
      ) +
      "\n\n" +
      renderCard(
        "Mode Deck",
        [
          ` {${THEME.brand}-fg}1{/${THEME.brand}-fg}  Training   {${THEME.muted}-fg}· guided drills and adaptive recovery{/${THEME.muted}-fg}`,
          ` {${THEME.brand}-fg}2{/${THEME.brand}-fg}  Lessons    {${THEME.muted}-fg}· focused accuracy-building reps{/${THEME.muted}-fg}`,
          ` {${THEME.brand}-fg}3{/${THEME.brand}-fg}  Test       {${THEME.muted}-fg}· timed pace check with full metrics{/${THEME.muted}-fg}`,
          ` {${THEME.brand}-fg}4{/${THEME.brand}-fg}  Custom     {${THEME.muted}-fg}· imported text for real-world practice{/${THEME.muted}-fg}`,
          ` {${THEME.brand}-fg}5{/${THEME.brand}-fg}  Stats      {${THEME.muted}-fg}· trend graphs and performance board{/${THEME.muted}-fg}`,
          ` {${THEME.brand}-fg}6{/${THEME.brand}-fg}  Coach      {${THEME.muted}-fg}· mistake heat-map and weak-key intel{/${THEME.muted}-fg}`
        ].join("\n"),
        THEME.brand
      ) +
      "\n\n" +
      renderCard(
        "Quick Controls",
        `{${THEME.muted}-fg}↵ launch  ·  Click to launch  ·  Ctrl+P palette{/${THEME.muted}-fg}\n` +
        `{${THEME.muted}-fg}F2 keyboard  ·  F3 sound  ·  F12 reset  ·  Q quit{/${THEME.muted}-fg}`,
        THEME.muted
      )
    );
    if (forcedPerfHud || settings.performanceMode) perfHud.show();
    renderHeader();
    renderIdleStats();
    menu.focus();
    screen.render();
  };

  const renderStartupSplash = (onDone: () => void): void => {
    menu.hide();
    panel.hide();
    footer.hide();
    statsBar.hide();

    const splash = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "70%",
      height: 9,
      tags: true,
      border: "line",
      style: { border: { fg: "cyan" }, bg: "black", fg: "white" },
      content: ""
    });

    const frames = spinners.dots.frames;
    let i = 0;
    const start = Date.now();

    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.floor((elapsed / 1400) * 100));
      const content = lip
        ? lip.apply({ value: `Typing Master Terminal\n\nLoading...\n${progressBar(pct, 30)} ${pct}%\n\nv1.1 · Blessed + charsm`, id: "splash" })
        : `{bold}{cyan-fg}  Typing Master Terminal{/cyan-fg}{/bold}\n` +
          `{cyan-fg}  ${"═".repeat(22)}{/cyan-fg}\n\n` +
          `{yellow-fg}  ${frames[i % frames.length]}{/yellow-fg}  {white-fg}Loading terminal surfaces...{/white-fg}\n` +
          `  ${progressBar(pct, 30)} {bold}${pct}%{/bold}\n\n` +
          `{gray-fg}  v1.1  ·  Blessed + charsm{/gray-fg}`;
      splash.setContent(content);
      i += 1;
      screen.render();

      if (elapsed >= 1400) {
        clearInterval(tick);
        splash.destroy();
        menu.show();
        panel.show();
        footer.show();
        statsBar.show();
        onDone();
      }
    }, spinners.dots.interval);
  };

  const runOnboarding = (onDone: () => void): void => {
    if (settings.onboardingCompleted) {
      onDone();
      return;
    }
    resetPanel();
    menu.hide();
    const report = runDoctor();
    const recommendedInput = report.recommendedInputStrategy;
    settings = {
      ...settings,
      inputStrategy: recommendedInput,
      preferredTerminalHost: detectTerminalHost() as typeof settings.preferredTerminalHost,
      reducedMotion: report.terminalHost === "powershell" ? true : settings.reducedMotion,
      onboardingCompleted: true
    };
    storage.saveSettings(settings);
    panel.setLabel(" Onboarding ");
    setPanelContent(
      renderCard(
        "Welcome To Typing Master v1.0",
        `{bold}{cyan-fg}Terminal Check{/cyan-fg}{/bold}\n` +
        `Host: {yellow-fg}${report.terminalHost}{/yellow-fg}\n` +
        `Input strategy: {green-fg}${recommendedInput}{/green-fg}\n` +
        `Reduced motion: ${settings.reducedMotion ? "{green-fg}enabled{/green-fg}" : "{gray-fg}off{/gray-fg}"}\n` +
        `${report.warnings.length > 0 ? `Warnings: {red-fg}${report.warnings.join(" | ")}{/red-fg}\n` : ""}\n` +
        `{bold}{magenta-fg}Quick Keys{/magenta-fg}{/bold}\n` +
        `Ctrl+P: command palette\n` +
        `F12: panic reset\n` +
        `F2/F3: keyboard/sound toggle\n\n` +
        "{gray-fg}Press Enter to start{/gray-fg}"
      )
    );
    panel.show();
    footer.show();
    statsBar.show();
    panel.focus();
    screen.render();
    const done = (_ch?: string, key?: blessed.Widgets.Events.IKeyEventArg): void => {
      if (key && key.name !== "enter" && key.name !== "return") return;
      screen.off("keypress", done);
      menu.show();
      onDone();
    };
    screen.on("keypress", done);
  };

  function runTypingMode(
    mode: "lesson" | "test" | "custom",
    text: string,
    textId: string,
    difficulty: Difficulty,
    onComplete?: (result: RunResult) => void
  ): void {
    resetPanel();
    panel.setLabel(` ${mode.toUpperCase()} RUN `);

    const session = new TypingSession(text, false);
    let lastKeyPress: { label: string; correct: boolean; at: number } | null = null;
    let running = true;
    let dirty = true;
    let drawQueued = false;
    let acceptingInput = false;
    const startedAt = Date.now();
    let lastSig = "";
    let lastSigAt = 0;

    const queueDraw = (): void => {
      if (!running || drawQueued) return;
      drawQueued = true;
      setTimeout(() => {
        drawQueued = false;
        draw();
      }, 0);
    };

    const draw = (): void => {
      if (!running) return;
      if (!dirty) return;
      const renderStart = perf.beginRender();
      const snap = session.snapshot;
      const elapsed = Math.max(1, Date.now() - startedAt);
      const live = computeLiveMetrics(snap.typed.length, snap.correctChars, snap.mistakes, elapsed);
      const progress = Math.floor((snap.cursor / Math.max(1, text.length)) * 100);
      const levelProfile = getLevelProfile(selectedLevel);
      const currentChar = text[snap.cursor] ?? "DONE";
      const lastFeedback = lastKeyPress
        ? `${lastKeyPress.label} ${lastKeyPress.correct ? "landed clean" : "was off"}`
        : "Waiting for your first key";
      renderLiveStats(live.netWpm, live.accuracy, snap.mistakes, progress);
      const viewport = createViewport(text, snap.cursor, UI.viewportChars);

      setPanelContent(
        renderHero(
          `${mode.toUpperCase()} MODE`,
          `${levelProfile.label} profile`,
          `${text.length} chars · flow-forward scoring · ${settings.showKeyboard ? "keyboard dock on" : "keyboard dock off"}`,
          toneForLevel(selectedLevel)
        ) +
        "\n\n" +
        renderCard(
          "Pace Board",
          `${renderPill("WPM", `${live.netWpm}`, THEME.ok)}  ` +
          `${renderPill("ACC", `${live.accuracy}%`, THEME.accent)}  ` +
          `${renderPill("ERR", `${snap.mistakes}`, snap.mistakes > 0 ? THEME.bad : THEME.brand)}  ` +
          `${renderPill("PROGRESS", `${progress}%`, toneForLevel(selectedLevel))}\n` +
          `${renderProgressRow("Run completion", progress, 100, 28, toneForLevel(selectedLevel))}\n` +
          `Current key: ${escapeTags(currentChar === " " ? "SPACE" : currentChar)}\n` +
          `Feedback: ${lastFeedback}`,
          THEME.brand
        ) +
        "\n\n" +
        renderSection("READ LANE", renderTargetDiff(text, snap.typed, viewport), THEME.accent) +
        "\n\n" +
        renderSection("TYPE LANE", renderTypedDiff(text, snap.typed, viewport), snap.mistakes > 0 ? THEME.bad : THEME.ok) +
        "\n\n" +
        (settings.showKeyboard
          ? renderCard("Keyboard Dock", renderKeyboard(lastKeyPress, settings.keyAnimation), THEME.info) + "\n\n"
          : renderCard(
            "Focus",
            `Keep the eye-line on the read lane, then trust rhythm in the type lane.\n` +
            `ESC exits the run immediately if you need to reset.`,
            THEME.muted
          ) + "\n\n") +
        `{${THEME.muted}-fg}ESC exits the run immediately{/` +
        `${THEME.muted}-fg}`
      );
      dirty = false;
      perf.endRender(renderStart);
      if (forcedPerfHud || settings.performanceMode) {
        const p = perf.snapshot();
        perfHud.show();
        perfHud.setContent(`{bold}Perf{/bold}\nRender:${p.renderMs}ms\nLag:${p.inputLagMs}ms Drops:${p.droppedFrames}`);
        if (p.renderMs > 20) logger.log("slow_render", { renderMs: p.renderMs, lagMs: p.inputLagMs, mode });
      }
      screen.render();
    };

    const finish = (): void => {
      running = false;
      const result = session.finalize(mode, textId, Date.now());
      const verdict = summarizeRunVerdict(result);
      storage.addRun(result);
      if (settings.sound) playEndSound();
      onComplete?.(result);
      renderHeader();
      renderIdleStats();
      cleanupInput();
      const finalize = (): void => {
        panel.setLabel(" Run Summary ");
        setPanelContent(
          lip
            ? lip.apply({
                value:
                  `Run Complete\n${verdict.title}\n\n` +
                  `Net WPM: ${result.netWpm}\n` +
                  `Accuracy: ${result.accuracy}%\n` +
                  `Mistakes: ${result.mistakes}\n` +
                  `CPM: ${result.cpm}\n\n` +
                  `${verdict.summary}\n\n` +
                  `Press any key to return`,
                id: "result"
              })
            : renderHero("RUN COMPLETE", verdict.title, verdict.summary, result.accuracy >= 95 ? THEME.ok : THEME.accent) +
              "\n\n" +
              renderCard(
                "Scoreboard",
                `${renderPill("NET", `${result.netWpm} WPM`, THEME.ok)}  ` +
                `${renderPill("ACC", `${result.accuracy}%`, THEME.accent)}  ` +
                `${renderPill("ERR", `${result.mistakes}`, result.mistakes > 0 ? THEME.bad : THEME.ok)}\n` +
                `${renderPill("CPM", `${result.cpm}`, THEME.brand)}  ` +
                `${renderPill("MODE", mode.toUpperCase(), toneForLevel(selectedLevel))}`,
                THEME.brand
              ) +
              "\n\n" +
              renderCard(
                "Next Move",
                `${verdict.summary}\n` +
                `Press any key to return to Mission Control.`,
                THEME.info
              )
        );
        screen.render();
        const returnHome = (): void => renderHome();
        screen.once("keypress", returnHome);
        screen.once("mousedown", returnHome);
        // Fallback so user is never stuck on result screen.
        setTimeout(() => {
          const isDestroyed = Boolean((screen as unknown as { destroyed?: boolean }).destroyed);
          if (!isDestroyed) renderHome();
        }, 1500);
      };
      if (settings.reducedMotion) finalize();
      else void runExitTransition(panel, finalize);
    };

    const onKeyEvent = (key: { name?: string; sequence?: string }): void => {
      if (!running) return;
      if (!acceptingInput && key.name !== "escape" && key.name !== "f2" && key.name !== "f3") return;
      perf.markInput();
      const sig = `${key.name ?? ""}|${key.sequence ?? ""}`;
      const now = Date.now();
      if (sig === lastSig && now - lastSigAt < 20) return;
      lastSig = sig;
      lastSigAt = now;

      if (key.name === "escape") {
        running = false;
        cleanupInput();
        renderHome();
        return;
      }
      if (key.name === "f3") {
        settings = { ...settings, sound: !settings.sound };
        storage.saveSettings(settings);
        renderMenuItems();
        renderHeader();
        renderIdleStats();
        showToast(`Sound ${settings.sound ? "ON" : "OFF"}`);
        dirty = true;
        queueDraw();
        return;
      }
      if (key.name === "f2") {
        settings = { ...settings, showKeyboard: !settings.showKeyboard };
        storage.saveSettings(settings);
        renderMenuItems();
        renderHeader();
        renderIdleStats();
        showToast(`Keyboard ${settings.showKeyboard ? "ON" : "OFF"}`);
        dirty = true;
        queueDraw();
        return;
      }

      const idx = session.snapshot.cursor;
      const printable = getPrintableKey(key);
      if (key.name === "backspace" || key.name === "delete") {
        session.applyKey("\b");
        lastKeyPress = { label: "BACKSPACE", correct: true, at: Date.now() };
      } else if (printable) {
        session.applyKey(printable);
        const correct = printable === text[idx];
        lastKeyPress = { label: normalizeKeyLabel(printable), correct, at: Date.now() };
        if (!correct) {
          if (settings.sound) playWrongSound();
          logger.log("wrong_key", { expected: text[idx] ?? "", actual: printable, cursor: idx });
        }
      } else {
        return;
      }

      dirty = true;
      queueDraw();
      if (session.snapshot.done) finish();
    };

    const useRawWindowsInput = process.platform === "win32" && (settings.inputStrategy === "raw" || settings.inputStrategy === "auto");

    const keypressHandler = (_ch: string, key: blessed.Widgets.Events.IKeyEventArg): void => {
      // On Windows raw-mode strategy consumes printable chars to avoid duplicate streams.
      if (useRawWindowsInput) {
        const isPrintable = typeof key.sequence === "string" && key.sequence.length === 1 && key.name !== "escape";
        const isEditingKey = key.name === "backspace" || key.name === "delete" || key.name === "space";
        if (isPrintable || isEditingKey) return;
      }
      onKeyEvent({ name: key.name, sequence: key.sequence as string | undefined });
    };

    let rawDataHandler: ((buf: Buffer) => void) | null = null;
    if (useRawWindowsInput) {
      rawDataHandler = (buf: Buffer): void => {
        if (!running) return;
        const raw = buf.toString("utf8");
        if (!raw || raw.startsWith("\x1b[<") || raw.startsWith("\x1b[M")) return;
        if (raw === "\x1b") return onKeyEvent({ name: "escape" });
        if (raw === "\b" || raw === "\x7f") return onKeyEvent({ name: "backspace" });
        if (raw.includes("\x1b")) return;
        for (const ch of raw) {
          if (ch < " " || ch === "\x7f") continue;
          onKeyEvent({ sequence: ch, name: ch.toLowerCase() });
        }
      };
      process.stdin.on("data", rawDataHandler);
    }

    const cleanupInput = (): void => {
      screen.off("keypress", keypressHandler);
      if (rawDataHandler) {
        process.stdin.off("data", rawDataHandler);
        rawDataHandler = null;
      }
    };

    screen.on("keypress", keypressHandler);
    panel.focus();
    if (settings.sound) playStartSound();
    const beginRun = (): void => {
      if (!running) return;
      acceptingInput = true;
      const liveTicker = setInterval(() => {
        if (!running) {
          clearInterval(liveTicker);
          return;
        }
        // Keep stats/progress moving smoothly without 60fps full re-render.
        dirty = true;
        draw();
      }, UI.liveTickerMs);
      dirty = true;
      queueDraw();
    };
    if (settings.reducedMotion) beginRun();
    else void runStartTransition(panel, mode).then(beginRun);
  }

  function showLessons(): void {
    resetPanel();
    const lessons = getLessonsForDifficulty(getLevelProfile(selectedLevel).difficulty);
    panel.setLabel(" Lessons ");
    const preview = blessed.box({
      parent: panel,
      top: 0,
      left: "42%",
      width: "58%",
      height: "100%",
      tags: true,
      border: "line",
      label: " Lesson Preview ",
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      style: { border: { fg: THEME.brand }, fg: THEME.text, bg: THEME.panel }
    });
    preview.on("wheelup", () => { preview.scroll(-3); screen.render(); });
    preview.on("wheeldown", () => { preview.scroll(3); screen.render(); });
    const chooser = blessed.list({
      parent: panel,
      left: 0,
      width: "42%",
      height: "100%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Drill Library ",
      style: {
        border: { fg: THEME.borderSecondary },
        selected: { bg: THEME.brand, fg: "black", bold: true },
        hover: { bg: THEME.accentSoft, fg: "white" }
      },
      items: lessons.map((l, index) => `${String(index + 1).padStart(2, "0")}  ${l.title}  [${l.level}]`)
    });
    chooser.focus();

    const renderLessonPreview = (lesson: Lesson | undefined): void => {
      if (!lesson) {
        preview.setContent(renderCard("No Lesson", "No lesson content is available for this difficulty yet.", THEME.bad));
        screen.render();
        return;
      }
      preview.setContent(
        renderHero("DRILL PREVIEW", lesson.title, `Level ${lesson.level.toUpperCase()} · ${lesson.text.length} chars`, toneForLevel(selectedLevel)) +
        "\n\n" +
        renderCard(
          "What To Expect",
          `This drill targets rhythm, accuracy, and repeatable movement.\n` +
          `Difficulty profile: ${getLevelProfile(selectedLevel).label}\n` +
          `Recommended posture: slow hands, clean cadence, no rushing.`,
          THEME.brand
        ) +
        "\n\n" +
        renderCard(
          "Preview Text",
          previewText(lesson.text, 220),
          THEME.accent
        ) +
        "\n\n" +
        renderCard(
          "Launch",
          "Press Enter to start the highlighted lesson.\nPress ESC to return to Mission Control.",
          THEME.muted
        )
      );
      screen.render();
    };

    const pick = (idx: number): void => {
      const lesson = lessons[idx];
      if (!lesson) return;
      chooser.destroy();
      preview.destroy();
      runTypingMode("lesson", lesson.text, lesson.id, lesson.level);
    };

    chooser.on("select", (_item, idx) => pick(idx));
    chooser.on("action", (_item, idx) => pick(idx));
    chooser.on("keypress", (_ch, key) => {
      if (key.name === "escape") {
        chooser.destroy();
        preview.destroy();
        renderHome();
        return;
      }
      const selected = (chooser as unknown as { selected?: number }).selected;
      renderLessonPreview(lessons[typeof selected === "number" ? selected : 0]);
    });
    chooser.on("click", () => {
      const selected = (chooser as unknown as { selected?: number }).selected;
      pick(typeof selected === "number" ? selected : 0);
    });

    chooser.select(0);
    renderLessonPreview(lessons[0]);
    screen.render();
  }

  function showTypingTest(): void {
    const level = getLevelProfile(selectedLevel);
    const cfg = getDifficultyConfig(level.difficulty);
    const wordCount = Math.max(12, cfg.wordCount + level.extraWords);
    const flavor = (Date.now() + cfg.seedOffset) % 2 === 0 ? "mixed" : "story";
    const text = makeParagraphTest(level.difficulty, wordCount, Math.floor(Date.now() / 1000) + cfg.seedOffset, flavor);
    runTypingMode("test", text, `paragraph-${selectedLevel}-${Date.now()}`, level.difficulty);
  }

  function showCustomTest(): void {
    resetPanel();
    panel.setLabel(" Custom Modes ");
    const modes = getCustomModeOptions();
    const preview = blessed.box({
      parent: panel,
      top: 0,
      left: "44%",
      width: "56%",
      height: "100%",
      tags: true,
      border: "line",
      label: " Mode Preview ",
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      style: { border: { fg: THEME.brand }, fg: THEME.text, bg: THEME.panel }
    });
    preview.on("wheelup", () => { preview.scroll(-3); screen.render(); });
    preview.on("wheeldown", () => { preview.scroll(3); screen.render(); });
    const chooser = blessed.list({
      parent: panel,
      left: 0,
      width: "44%",
      height: "100%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Custom Test Types ",
      style: {
        border: { fg: THEME.borderSecondary },
        selected: { bg: THEME.brand, fg: "black", bold: true },
        hover: { bg: THEME.accentSoft, fg: "white" }
      },
      items: modes.map((mode, index) => `${String(index + 1).padStart(2, "0")}  ${mode.label}`)
    });
    chooser.focus();

    const renderModePreview = (mode: CustomMode | undefined): void => {
      if (!mode) return;
      const config = modes.find((item) => item.id === mode);
      const level = getLevelProfile(selectedLevel);
      const previewSeed = 1000 + modes.findIndex((item) => item.id === mode) * 37 + LEVELS.indexOf(selectedLevel) * 13;
      const built = buildCustomModeText(mode, level.difficulty, previewSeed, readImportedCustomText());
      preview.setContent(
        renderHero("CUSTOM MODE", config?.label ?? "Custom", config?.description ?? "", toneForLevel(selectedLevel)) +
        "\n\n" +
        renderCard(
          "Profile",
          `${renderPill("LEVEL", level.label.toUpperCase(), toneForLevel(selectedLevel))}  ` +
          `${renderPill("DIFFICULTY", level.difficulty.toUpperCase(), THEME.brand)}\n` +
          `This mode uses ${mode.replace(/-/g, " ")} content tuned for the current level.`,
          THEME.brand
        ) +
        "\n\n" +
        renderCard(
          "Preview Text",
          previewText(built.text, 240),
          THEME.accent
        ) +
        "\n\n" +
        renderCard(
          "Launch",
          "Press Enter to start the selected custom mode.\nPress ESC to go back.",
          THEME.muted
        )
      );
      screen.render();
    };

    const pick = (idx: number): void => {
      const mode = modes[idx];
      if (!mode) return;
      const level = getLevelProfile(selectedLevel);
      const built = buildCustomModeText(mode.id, level.difficulty, Date.now(), readImportedCustomText());
      chooser.destroy();
      preview.destroy();
      runTypingMode("custom", built.text, built.textId, level.difficulty);
    };

    chooser.on("select", (_item, idx) => pick(idx));
    chooser.on("action", (_item, idx) => pick(idx));
    chooser.on("keypress", (_ch, key) => {
      if (key.name === "escape") {
        chooser.destroy();
        preview.destroy();
        renderHome();
        return;
      }
      const selected = (chooser as unknown as { selected?: number }).selected;
      renderModePreview(modes[typeof selected === "number" ? selected : 0]?.id);
    });
    chooser.on("click", () => {
      const selected = (chooser as unknown as { selected?: number }).selected;
      pick(typeof selected === "number" ? selected : 0);
    });

    chooser.select(0);
    renderModePreview(modes[0]?.id);
    screen.render();
  }

  function trainingTierToDifficulty(tier: TrainingProgress["tier"]): Difficulty {
    if (tier === "rookie") return "beginner";
    if (tier === "cadet") return "intermediate";
    if (tier === "pro") return "advanced";
    return "expert";
  }

  function showPracticeTraining(): void {
    resetPanel();
    const progress = storage.getTrainingProgress();
    const targetDifficulty = trainingTierToDifficulty(progress.tier);
    const pool = getLessonsForDifficulty(targetDifficulty);
    const lesson = pool.length > 0 ? pool[progress.completedDrills % pool.length] : null;
    const nextTierAt =
      progress.tier === "rookie" ? 150 :
      progress.tier === "cadet" ? 350 :
      progress.tier === "pro" ? 700 :
      progress.tier === "elite" ? 1100 : progress.points;
    const coach = storage.getCoachInsights(50);

    panel.setLabel(" Practice Training ");

    const summaryBox = blessed.box({
      parent: panel,
      top: 0,
      left: 0,
      width: "100%",
      height: "74%",
      tags: true,
      border: "line",
      label: " Training Summary ",
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      style: { border: { fg: THEME.brand }, fg: THEME.text, bg: THEME.panel }
    });
    summaryBox.on("wheelup", () => { summaryBox.scroll(-3); screen.render(); });
    summaryBox.on("wheeldown", () => { summaryBox.scroll(3); screen.render(); });

    const actions = blessed.list({
      parent: panel,
      top: "74%",
      left: 0,
      width: "100%",
      height: "26%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Launch Options ",
      style: {
        border: { fg: THEME.borderSecondary },
        selected: { bg: THEME.brand, fg: "black", bold: true },
        hover: { bg: THEME.accentSoft, fg: "white" }
      },
      items: [
        "Guided Drill   - recommended next step",
        "Adaptive Drill - pressure-test weak keys",
        "Back to Home   - return to dashboard"
      ]
    });
    actions.focus();

    const drawSummary = (): void => {
      const summaryText =
        renderHero(
          "0 TO BEST PROGRAM",
          `Tier ${progress.tier.toUpperCase()}`,
          "Structured progression from warm control to elite speed without losing accuracy.",
          toneForLevel(selectedLevel)
        ) +
        "\n\n" +
        renderCard(
          "Progress Core",
          `${renderPill("POINTS", `${progress.points}`, THEME.ok)}  ` +
          `${renderPill("DRILLS", `${progress.completedDrills}`, THEME.brand)}  ` +
          `${renderPill("BEST", `${progress.bestWpm} WPM`, THEME.accent)}\n` +
          `${renderPill("ACC", `${progress.bestAccuracy}%`, THEME.info)}  ` +
          `${renderPill("GATE", coach.consistency >= 70 && progress.bestAccuracy >= 95 ? "PASS" : "PENDING", coach.consistency >= 70 && progress.bestAccuracy >= 95 ? THEME.ok : THEME.bad)}\n` +
          `${renderProgressRow("Tier climb", progress.points, nextTierAt, 26, toneForLevel(selectedLevel))}`,
          THEME.brand
        ) +
        "\n\n" +
        renderCard(
          "Coach Readout",
          `Consistency ${coach.consistency} · Fatigue ${coach.fatigueScore}\n` +
          `Target difficulty: ${targetDifficulty.toUpperCase()}\n` +
          `Weakest key: ${coach.weakestKeys[0] ? `${coach.weakestKeys[0].key} x${coach.weakestKeys[0].count}` : "No data yet"}\n` +
          `Weakest bigram: ${coach.weakestBigrams[0] ? `${coach.weakestBigrams[0].bigram} x${coach.weakestBigrams[0].count}` : "No data yet"}`,
          THEME.info
        ) +
        "\n\n" +
        renderCard(
          "Next Drill",
          `Recommended: ${lesson ? `${lesson.title} [${lesson.level}]` : "No lesson available"}\n` +
          `Mission: ${coach.dailyTarget}\n` +
          `Use Guided Drill for progression or Adaptive Drill to attack mistakes directly.`,
          THEME.accent
        );
      summaryBox.setContent(summaryText);
      screen.render();
    };

    const pick = (idx: number): void => {
      if (idx === 0) {
        if (!lesson) {
          actions.destroy();
          renderHome();
          return;
        }
        actions.destroy();
        runTypingMode("lesson", lesson.text, `training-${lesson.id}-${Date.now()}`, lesson.level, (result) => {
          storage.recordTrainingRun(result);
        });
        return;
      }
      if (idx === 1) {
        const adaptive = composeAdaptiveDrill(coach.weakestKeys, coach.weakestBigrams, 65);
        actions.destroy();
        runTypingMode("custom", adaptive, `adaptive-${Date.now()}`, targetDifficulty, (result) => {
          storage.recordTrainingRun(result);
        });
        return;
      }
      actions.destroy();
      renderHome();
    };

    actions.on("select", (_item, idx) => pick(idx));
    actions.on("action", (_item, idx) => pick(idx));
    actions.on("click", () => {
      const selected = (actions as unknown as { selected?: number }).selected;
      pick(typeof selected === "number" ? selected : 0);
    });
    actions.on("keypress", (_ch, key) => {
      if (key.name === "escape") {
        actions.destroy();
        summaryBox.destroy();
        renderHome();
      }
    });

    drawSummary();
  }

  function showDifficultyPicker(): void {
    resetPanel();
    panel.setLabel(" Game Level ");
    const preview = blessed.box({
      parent: panel,
      top: 0,
      left: "42%",
      width: "58%",
      height: "100%",
      tags: true,
      border: "line",
      label: " Difficulty Preview ",
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      style: { border: { fg: THEME.brand }, fg: THEME.text, bg: THEME.panel }
    });
    preview.on("wheelup", () => { preview.scroll(-3); screen.render(); });
    preview.on("wheeldown", () => { preview.scroll(3); screen.render(); });
    const chooser = blessed.list({
      parent: panel,
      left: 0,
      width: "42%",
      height: "100%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Levels ",
      style: {
        border: { fg: THEME.borderSecondary },
        selected: { bg: THEME.info, fg: "white", bold: true },
        hover: { bg: THEME.accentSoft, fg: "white" }
      },
      items: LEVELS.map((level) => {
        const profile = getLevelProfile(level);
        const cfg = getDifficultyConfig(profile.difficulty);
        const words = Math.max(12, cfg.wordCount + profile.extraWords);
        return `${profile.label.toUpperCase().padEnd(10, " ")} ${words} words/test`;
      })
    });

    chooser.select(LEVELS.indexOf(selectedLevel));
    chooser.focus();

    const renderLevelPreview = (level: GameLevel | undefined): void => {
      if (!level) return;
      const profile = getLevelProfile(level);
      const cfg = getDifficultyConfig(profile.difficulty);
      const words = Math.max(12, cfg.wordCount + profile.extraWords);
      const sample = makeParagraphTest(profile.difficulty, Math.min(18, words), cfg.seedOffset + words);
      preview.setContent(
        renderHero("LEVEL SELECT", profile.label.toUpperCase(), levelDescriptor(level), toneForLevel(level)) +
        "\n\n" +
        renderCard(
          "Profile",
          `${renderPill("DIFFICULTY", profile.difficulty.toUpperCase(), toneForLevel(level))}  ` +
          `${renderPill("WORDS", `${words}`, THEME.brand)}\n` +
          `Use this level when you want ${levelTip(level)}.`,
          THEME.brand
        ) +
        "\n\n" +
        renderCard(
          "Sample Texture",
          previewText(sample, 220),
          THEME.accent
        ) +
        "\n\n" +
        renderCard(
          "Apply",
          "Press Enter to lock this level for lessons and tests.\nPress ESC to go back without changes.",
          THEME.muted
        )
      );
      screen.render();
    };

    const pick = (idx: number): void => {
      const next = LEVELS[idx];
      if (!next) return;
      selectedLevel = next;
      chooser.destroy();
       preview.destroy();
      renderHeader();
      renderIdleStats();
      showToast(`Level set to ${getLevelProfile(selectedLevel).label}`);
      renderHome();
    };

    chooser.on("select", (_item, idx) => pick(idx));
    chooser.on("action", (_item, idx) => pick(idx));
    chooser.on("keypress", (_ch, key) => {
      if (key.name === "escape") {
        chooser.destroy();
        preview.destroy();
        renderHome();
        return;
      }
      const selected = (chooser as unknown as { selected?: number }).selected;
      renderLevelPreview(LEVELS[typeof selected === "number" ? selected : 0]);
    });
    chooser.on("click", () => {
      const selected = (chooser as unknown as { selected?: number }).selected;
      pick(typeof selected === "number" ? selected : 0);
    });

    renderLevelPreview(LEVELS[LEVELS.indexOf(selectedLevel)]);
    screen.render();
  }

  function showStats(): void {
    resetPanel();
    panel.setLabel(" Performance Board ");
    const s = storage.getStats90d();
    const runs = storage.getRuns(60);
    const recent = [...runs].reverse().slice(-25);
    const wpmSeries = recent.map((r) => r.netWpm);
    const accSeries = recent.map((r) => r.accuracy);
    const cleanStreak = computeCleanStreak(runs);
    const bestRun = runs.reduce<RunResult | null>((best, run) => {
      if (!best || run.netWpm > best.netWpm) return run;
      return best;
    }, null);
    const momentum = runs.length >= 2 ? round2(runs[0].netWpm - runs[Math.min(runs.length - 1, 9)].netWpm) : 0;
    const modeCounts = new Map<string, number>();
    for (const run of runs) {
      modeCounts.set(run.mode, (modeCounts.get(run.mode) ?? 0) + 1);
    }
    const modeLines = [...modeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mode, count]) => `${mode.padEnd(8)} ${bar(count, Math.max(1, runs.length), 16)} ${count}`)
      .join("\n");

    const recentRows = runs.slice(0, 10)
      .map((r, i) => `${String(i + 1).padStart(2, "0")}  ${r.mode.padEnd(7)} ${String(r.netWpm).padStart(6)}  ${String(r.accuracy).padStart(6)}%  ${formatRelativeTime(r.startedAt)}`)
      .join("\n");

    setPanelContent(
      renderHero(
        "PERFORMANCE BOARD",
        "90 day snapshot",
        "A compact view of pace, accuracy, and stability so you can see whether the system is actually improving.",
        THEME.brand
      ) +
      "\n\n" +
      renderCard(
        "Core Metrics",
        `${renderPill("BEST", `${s.bestWpm} WPM`, THEME.ok)}  ` +
        `${renderPill("AVG", `${s.avgWpm} WPM`, THEME.accent)}  ` +
        `${renderPill("ACC", `${s.avgAccuracy}%`, THEME.info)}\n` +
        `${renderPill("CONSISTENCY", `${s.consistency}`, THEME.brand)}  ` +
        `${renderPill("RUNS", `${s.totalRuns}`, THEME.brand)}  ` +
        `${renderPill("STREAK", `${cleanStreak}`, cleanStreak > 0 ? THEME.ok : THEME.muted)}\n` +
        `Momentum: ${momentum >= 0 ? "+" : ""}${momentum} WPM over recent sessions\n` +
        `Peak run: ${bestRun ? `${bestRun.netWpm} WPM at ${bestRun.accuracy}% accuracy` : "No data yet"}`,
        THEME.brand
      ) +
      "\n\n" +
      renderCard(
        "Trendlines",
        `{green-fg}${sparkline(wpmSeries)}{/green-fg}  WPM\n` +
        `{magenta-fg}${sparkline(accSeries)}{/magenta-fg}  Accuracy`,
        THEME.ok
      ) +
      "\n\n" +
      renderSection("Mode Split", modeLines || "{gray-fg}No run data{/gray-fg}", THEME.info) +
      "\n\n" +
      renderSection("Recent Runs", recentRows || "{gray-fg}No recent runs{/gray-fg}", THEME.text)
    );

    screen.render();
  }

  function showCoachInsights(): void {
    resetPanel();
    panel.setLabel(" Coach Insights ");
    const coach = storage.getCoachInsights(50);
    const adaptivePreview = composeAdaptiveDrill(coach.weakestKeys, coach.weakestBigrams, 45);
    const keys = coach.weakestKeys.length > 0
      ? coach.weakestKeys.map((k) => `${k.key}:${k.count}`).join(", ")
      : "No key mistake data yet";
    const bigrams = coach.weakestBigrams.length > 0
      ? coach.weakestBigrams.map((k) => `${k.bigram}:${k.count}`).join(", ")
      : "No bigram mistake data yet";
    setPanelContent(
      renderHero(
        "COACH INTEL",
        "Mistake map",
        "This board surfaces the friction patterns hiding underneath your average WPM.",
        THEME.info
      ) +
      "\n\n" +
      renderCard(
        "Signal Readout",
        `${renderPill("RUNS", `${coach.runsAnalyzed}`, THEME.brand)}  ` +
        `${renderPill("CONSISTENCY", `${coach.consistency}`, THEME.ok)}  ` +
        `${renderPill("FATIGUE", `${coach.fatigueScore}`, coach.fatigueScore > 4 ? THEME.bad : THEME.accent)}\n` +
        `Daily target: ${coach.dailyTarget}`,
        THEME.brand
      ) +
      "\n\n" +
      renderCard(
        "Weak Spots",
        `Keys: ${keys}\n` +
        `Bigrams: ${bigrams}`,
        THEME.accent
      ) +
      "\n\n" +
      renderCard(
        "Adaptive Drill Preview",
        `${previewText(adaptivePreview, 220)}\n\n` +
        `Recommended move: open Practice Training and launch Adaptive Drill.`,
        THEME.info
      )
    );
    screen.render();
  }

  const onMenuPick = (idx: number): void => {
    switch (idx) {
      case 0:
        showPracticeTraining();
        break;
      case 1:
        showLessons();
        break;
      case 2:
        showTypingTest();
        break;
      case 3:
        showCustomTest();
        break;
      case 4:
        showStats();
        break;
      case 5:
        showCoachInsights();
        break;
      case 6:
        showDifficultyPicker();
        break;
      case 7:
        settings = { ...settings, sound: !settings.sound };
        storage.saveSettings(settings);
        renderMenuItems();
        renderHeader();
        renderIdleStats();
        showToast(`Sound ${settings.sound ? "ON" : "OFF"}`);
        screen.render();
        break;
      case 8:
        settings = { ...settings, showKeyboard: !settings.showKeyboard };
        storage.saveSettings(settings);
        renderMenuItems();
        renderHeader();
        renderIdleStats();
        showToast(`Keyboard ${settings.showKeyboard ? "ON" : "OFF"}`);
        screen.render();
        break;
      default:
        storage.close();
        screen.destroy();
        process.exit(0);
    }
  };

  const openCommandPalette = (): void => {
    type PaletteAction = { label: string; run: () => void };
    const actions: PaletteAction[] = [
      { label: "Training: Open Practice", run: () => onMenuPick(0) },
      { label: "Coach: Open Insights", run: () => onMenuPick(5) },
      { label: "Stats: Open Dashboard", run: () => onMenuPick(4) },
      {
        label: "System: Toggle Performance Mode",
        run: () => {
          settings = { ...settings, performanceMode: !settings.performanceMode };
          storage.saveSettings(settings);
          if (settings.performanceMode || forcedPerfHud) perfHud.show(); else perfHud.hide();
          showToast(`Performance mode ${settings.performanceMode ? "ON" : "OFF"}`);
        }
      },
      { label: "Audio: Toggle Sound", run: () => onMenuPick(7) },
      { label: "Visual: Toggle Keyboard", run: () => onMenuPick(8) },
      {
        label: "System: Run Doctor",
        run: () => {
          const report = runDoctor();
          showToast(`Doctor: ${report.terminalHost}, input ${report.recommendedInputStrategy}`);
        }
      },
      { label: "Close Palette", run: () => undefined }
    ];
    let query = "";
    let filtered = [...actions];
    let closing = false;
    const sh = typeof screen.height === "number" ? screen.height : 40;
    const sw = typeof screen.width === "number" ? screen.width : 120;
    const width = Math.max(54, Math.floor(sw * 0.56));
    const left = Math.max(0, Math.floor((sw - width) / 2));
    const finalTop = Math.max(3, Math.floor(sh * 0.35));
    const startTop = finalTop + 4;
    const listHeight = Math.max(10, Math.min(14, Math.floor(sh * 0.34)));
    const titleTop = Math.max(1, finalTop - 3);
    const hintTop = Math.min(sh - 2, finalTop + listHeight + 1);

    const overlay = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      style: { bg: "black" },
      mouse: true
    });
    const title = blessed.box({
      parent: screen,
      top: startTop - 3,
      left,
      width,
      height: 2,
      tags: true,
      align: "center",
      content: `{bold}{cyan-fg}Quick Launch Palette{/cyan-fg}{/bold}  {gray-fg}(system + training actions){/gray-fg}`
    });
    const palette = blessed.list({
      parent: screen,
      top: startTop,
      left,
      width,
      height: listHeight,
      border: "line",
      label: " Actions ",
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: THEME.borderSecondary },
        item: { fg: THEME.text },
        selected: { bg: THEME.brand, fg: "black", bold: true },
        hover: { bg: THEME.accentSoft, fg: "white" }
      },
      items: actions.map((a) => a.label)
    });
    const hint = blessed.box({
      parent: screen,
      top: hintTop,
      left,
      width,
      height: 1,
      tags: true,
      align: "center",
      content: "{gray-fg}Type to filter · Backspace edits · Enter launches · Esc closes{/gray-fg}"
    });
    hint.hide();
    palette.focus();

    const updateFilter = (): void => {
      const q = query.trim().toLowerCase();
      filtered = q.length === 0 ? [...actions] : actions.filter((a) => a.label.toLowerCase().includes(q));
      palette.setItems(filtered.length > 0 ? filtered.map((a) => a.label) : ["No matching actions"]);
      palette.select(0);
      title.setContent(
        `{bold}{cyan-fg}Quick Launch Palette{/cyan-fg}{/bold}  ` +
        `{gray-fg}query:{/gray-fg} {yellow-fg}${escapeTags(query || "all")}{/yellow-fg}`
      );
      screen.render();
    };

    const animateOpen = (): void => {
      const steps = 6;
      let i = 0;
      const t = setInterval(() => {
        i += 1;
        const p = i / steps;
        const top = Math.round(startTop + (finalTop - startTop) * p);
        title.top = top - 3;
        palette.top = top;
        screen.render();
        if (i >= steps) {
          clearInterval(t);
          hint.show();
          screen.render();
        }
      }, 18);
    };

    const close = (): void => {
      if (closing) return;
      closing = true;
      hint.hide();
      const steps = 5;
      let i = 0;
      const fromTop = typeof palette.top === "number" ? palette.top : finalTop;
      const toTop = fromTop + 3;
      const t = setInterval(() => {
        i += 1;
        const p = i / steps;
        const top = Math.round(fromTop + (toTop - fromTop) * p);
        title.top = top - 3;
        palette.top = top;
        screen.render();
        if (i >= steps) {
          clearInterval(t);
          hint.destroy();
          title.destroy();
          palette.destroy();
          overlay.destroy();
          menu.focus();
          screen.render();
        }
      }, 16);
    };

    const pick = (idx: number): void => {
      if (filtered.length === 0) return;
      const action = filtered[idx];
      if (!action) return;
      if (action.label !== "Close Palette") action.run();
      close();
    };

    palette.on("select", (_item, idx) => pick(idx));
    palette.on("keypress", (ch: string, key: blessed.Widgets.Events.IKeyEventArg) => {
      if (key.name === "escape") return close();
      if (key.name === "enter" || key.name === "return") {
        const selected = (palette as unknown as { selected?: number }).selected;
        return pick(typeof selected === "number" ? selected : 0);
      }
      if (key.name === "backspace" || key.name === "delete") {
        if (query.length === 0) return;
        query = query.slice(0, -1);
        return updateFilter();
      }
      if (key.ctrl && key.name === "u") {
        query = "";
        return updateFilter();
      }
      if (typeof ch === "string" && ch.length === 1 && ch >= " " && ch <= "~") {
        query += ch;
        return updateFilter();
      }
    });
    overlay.on("click", close);
    palette.key(["escape"], close);
    animateOpen();
    screen.render();
  };

  const panicReset = (): void => {
    resetPanel();
    toast.hide();
    renderHeader();
    renderIdleStats();
    renderHome();
    logger.log("panic_reset", { reason: "manual_f12" });
    showToast("UI reset complete");
  };

  let lastMenuPick = { idx: -1, at: 0 };
  const triggerMenuPick = (idx: number): void => {
    const now = Date.now();
    if (lastMenuPick.idx === idx && now - lastMenuPick.at < 120) return;
    lastMenuPick = { idx, at: now };
    onMenuPick(idx);
  };
  menu.on("select", (_item, idx) => triggerMenuPick(idx));
  menu.on("action", (_item, idx) => triggerMenuPick(idx));
  menu.on("click", () => {
    const selected = (menu as unknown as { selected?: number }).selected;
    triggerMenuPick(typeof selected === "number" ? selected : 0);
  });

  panel.on("wheelup", () => {
    panel.scroll(-2);
    screen.render();
  });
  panel.on("wheeldown", () => {
    panel.scroll(2);
    screen.render();
  });

  screen.key(["q", "C-c"], () => {
    storage.close();
    screen.destroy();
    process.exit(0);
  });

  screen.key(["f3"], () => {
    settings = { ...settings, sound: !settings.sound };
    storage.saveSettings(settings);
    renderMenuItems();
    renderHeader();
    renderIdleStats();
    showToast(`Sound ${settings.sound ? "ON" : "OFF"}`);
    screen.render();
  });

  screen.key(["C-p"], () => {
    openCommandPalette();
  });

  screen.key(["f12"], () => {
    panicReset();
  });

  screen.key(["f2"], () => {
    settings = { ...settings, showKeyboard: !settings.showKeyboard };
    storage.saveSettings(settings);
    renderMenuItems();
    renderHeader();
    renderIdleStats();
    showToast(`Keyboard ${settings.showKeyboard ? "ON" : "OFF"}`);
    screen.render();
  });

  renderHeader();
  renderMenuItems();
  renderIdleStats();
  renderStartupSplash(() => {
    runOnboarding(() => {
      menu.focus();
      renderHome();
      logger.log("app_ready", { host: detectTerminalHost(), perfHud: forcedPerfHud || settings.performanceMode });
    });
  });
}

function toneForLevel(level: string): string {
  switch (level) {
    case "rookie":
      return THEME.accentSoft;
    case "very-easy":
      return THEME.brand;
    case "easy":
      return THEME.ok;
    case "medium":
      return THEME.accent;
    case "challenging":
      return THEME.info;
    case "hard":
      return THEME.info;
    case "expert":
      return THEME.brand;
    case "master":
      return THEME.ok;
    case "insane":
      return THEME.bad;
    case "legend":
      return THEME.bad;
    default:
      return THEME.brand;
  }
}

function levelDescriptor(level: string): string {
  switch (level) {
    case "rookie":
      return "Shortest runs for first-day confidence and hand placement.";
    case "very-easy":
      return "Low-pressure onboarding with shorter tests and forgiving volume.";
    case "easy":
      return "Foundation work for clean rhythm and stable accuracy.";
    case "medium":
      return "Balanced pacing once beginner flow starts to feel automatic.";
    case "challenging":
      return "A step above medium with longer passages and more density.";
    case "hard":
      return "Longer passages with more pressure on consistency.";
    case "expert":
      return "High-demand runs for experienced typists protecting accuracy.";
    case "master":
      return "Expert text with longer runs designed to tax concentration.";
    case "insane":
      return "Extended expert runs built to stress pace, stamina, and focus.";
    case "legend":
      return "Maximum-length expert runs for players chasing pure endurance.";
    default:
      return "General purpose typing difficulty.";
  }
}

function levelTip(level: string): string {
  switch (level) {
    case "rookie":
      return "learning the game without overload";
    case "very-easy":
      return "rebuilding confidence and learning the interface";
    case "easy":
      return "locking in form before chasing raw speed";
    case "medium":
      return "keeping training balanced between speed and control";
    case "challenging":
      return "bridging the gap between comfort and pressure";
    case "hard":
      return "pushing stamina without jumping into chaos";
    case "expert":
      return "testing whether your fundamentals hold under pressure";
    case "master":
      return "building long-run control at expert density";
    case "insane":
      return "seeing how far your pace survives when the text fights back";
    case "legend":
      return "testing endurance when every mistake compounds";
    default:
      return "consistent practice";
  }
}

function trainingTierGoal(tier: TrainingProgress["tier"]): number {
  if (tier === "rookie") return 150;
  if (tier === "cadet") return 350;
  if (tier === "pro") return 700;
  if (tier === "elite") return 1100;
  return 1100;
}

function computeCleanStreak(runs: RunResult[]): number {
  let streak = 0;
  for (const run of runs) {
    if (run.accuracy < 95) break;
    streak += 1;
  }
  return streak;
}

function summarizeRunVerdict(result: RunResult): { title: string; summary: string } {
  if (result.accuracy >= 98 && result.netWpm >= 80) {
    return {
      title: "Laser Clean",
      summary: "High speed with almost no leakage. Keep this cadence and extend the session length."
    };
  }
  if (result.accuracy >= 96) {
    return {
      title: "Stable And Clean",
      summary: "Accuracy is holding. The next gain comes from staying loose and adding pace in small steps."
    };
  }
  if (result.netWpm >= 70 && result.accuracy < 94) {
    return {
      title: "Fast But Leaking",
      summary: "You have pace, but too much of it escapes into errors. Back off slightly and rebuild control."
    };
  }
  return {
    title: "Foundation Pass",
    summary: "Useful work logged. Focus on cleaner keystrokes first, then let speed rise naturally."
  };
}

function previewText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return escapeTags(normalized);
  return `${escapeTags(normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd())}…`;
}

function renderHero(eyebrow: string, title: string, subtitle: string, tone: string): string {
  return (
    `{${THEME.muted}-fg}  ▸ ${eyebrow}{/${THEME.muted}-fg}\n` +
    `{bold}{${tone}-fg}  ${escapeTags(title)}{/${tone}-fg}{/bold}\n` +
    `{${tone}-fg}  ${"═".repeat(Math.max(18, Math.min(40, title.length + 10)))}{/${tone}-fg}\n` +
    `  ${escapeTags(subtitle)}`
  );
}

function renderPill(label: string, value: string, tone: string): string {
  return `{black-fg}{${tone}-bg} ${escapeTags(label)} {/${tone}-bg}{/black-fg} {bold}{${tone}-fg}${escapeTags(value)}{/${tone}-fg}{/bold}`;
}

function renderProgressRow(label: string, value: number, total: number, width: number, tone: string): string {
  const safeTotal = Math.max(1, total);
  const pct = Math.max(0, Math.min(100, Math.round((value / safeTotal) * 100)));
  return `{${THEME.muted}-fg}${escapeTags(label)}{/${THEME.muted}-fg}  {${tone}-fg}${progressBar(pct, width)}{/${tone}-fg} {bold}${pct}%{/bold}`;
}

function renderTargetDiff(target: string, typed: string, viewport: Viewport): string {
  const out: string[] = [];
  if (viewport.start > 0) out.push("{gray-fg}… {/gray-fg}");
  for (let i = viewport.start; i < viewport.end; i++) {
    const raw = target[i];
    const ch = escapeTags(raw);
    if (i < typed.length) {
      out.push(`{gray-fg}${ch}{/gray-fg}`);
    } else if (i === typed.length) {
      const displayCh = raw === " " ? "·" : ch;
      out.push(`{black-fg}{cyan-bg}${displayCh}{/cyan-bg}{/black-fg}`);
    } else {
      out.push(`{white-fg}${ch}{/white-fg}`);
    }
  }
  if (viewport.end < target.length) out.push("{gray-fg} …{/gray-fg}");
  return out.join("");
}

function renderTypedDiff(target: string, typed: string, viewport: Viewport): string {
  if (!typed) return `{gray-fg}  ▸ awaiting first keystroke…{/gray-fg}`;
  const out: string[] = [];
  if (viewport.start > 0 && typed.length > viewport.start) out.push("{gray-fg}… {/gray-fg}");
  for (let i = viewport.start; i < Math.min(viewport.end, typed.length); i++) {
    const c = escapeTags(typed[i]);
    if (typed[i] === target[i]) out.push(`{green-fg}${c}{/green-fg}`);
    else out.push(`{red-fg}${c}{/red-fg}`);
  }
  if (typed.length >= viewport.start && typed.length < viewport.end) {
    out.push(`{black-fg}{cyan-bg} {/cyan-bg}{/black-fg}`);
  }
  if (typed.length > viewport.end) out.push("{gray-fg} …{/gray-fg}");
  return out.join("");
}

interface Viewport {
  start: number;
  end: number;
}

function createViewport(target: string, cursor: number, size: number): Viewport {
  if (target.length <= size) return { start: 0, end: target.length };
  const pivot = Math.max(0, Math.min(target.length, cursor));
  const left = Math.floor(size * 0.45);
  let start = Math.max(0, pivot - left);
  let end = Math.min(target.length, start + size);
  if (end - start < size) start = Math.max(0, end - size);
  return { start, end };
}

function renderKeyboard(lastKeyPress: { label: string; correct: boolean; at: number } | null, animate: boolean): string {
  const rows: string[][] = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "BACKSPACE"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "ENTER"],
    ["Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "SPACE"]
  ];
  const active = Boolean(lastKeyPress && (!animate || Date.now() - lastKeyPress.at <= 180));
  const out: string[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const cells: string[] = [];
    if (rowIndex === 1) cells.push("  ");
    if (rowIndex === 2) cells.push("    ");
    if (rowIndex === 3) cells.push("      ");
    for (const key of row) {
      const width = key === "BACKSPACE" || key === "ENTER" ? 11 : key === "SPACE" ? 18 : 3;
      const label = key.padEnd(width, " ");
      const pressed = active && lastKeyPress?.label === key;
      if (pressed) {
        cells.push(lastKeyPress?.correct
          ? `{bold}{black-fg}{green-bg}[${escapeTags(label)}]{/green-bg}{/black-fg}{/bold}`
          : `{bold}{white-fg}{red-bg}[${escapeTags(label)}]{/red-bg}{/white-fg}{/bold}`);
      } else {
        cells.push(`{gray-fg}[${escapeTags(label)}]{/gray-fg}`);
      }
    }
    out.push(cells.join(" "));
  }

  return out.join("\n");
}

function getPrintableKey(key: { name?: string; sequence?: string }): string | null {
  if (typeof key.sequence === "string" && key.sequence.length === 1) return key.sequence;
  if (typeof key.name === "string" && key.name.length === 1) return key.name;
  if (key.name === "space") return " ";
  return null;
}

function normalizeKeyLabel(input: string): string {
  if (input === " ") return "SPACE";
  return input.toUpperCase();
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

function progressBar(percent: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
  return `▕${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}▏`;
}

function computeLiveMetrics(typedLength: number, correctChars: number, mistakes: number, elapsedMs: number): {
  netWpm: number;
  accuracy: number;
} {
  const minutes = Math.max(1, elapsedMs) / 60000;
  const grossWpm = (typedLength / 5) / minutes;
  const penalty = mistakes / minutes / 5;
  const netWpm = round2(Math.max(0, grossWpm - penalty));
  const accuracy = round2((correctChars / Math.max(1, typedLength)) * 100);
  return { netWpm, accuracy };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeTags(value: string): string {
  return value.replace(/[{}/]/g, "\\$&");
}

function clipAnsiAware(value: string, maxCols: number): string {
  if (stringWidth(value) <= maxCols) return value;
  return `${value.slice(0, Math.max(0, maxCols - 1))}…`;
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "now";
  const delta = Date.now() - ts;
  if (delta < 60000) return "now";
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return `${Math.floor(delta / 86400000)}d ago`;
}

function sparkline(values: number[]): string {
  if (values.length === 0) return "no data";
  const ticks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return ticks[Math.floor(ticks.length / 2)].repeat(values.length);
  return values
    .map((v) => {
      const idx = Math.max(0, Math.min(ticks.length - 1, Math.floor(((v - min) / (max - min)) * (ticks.length - 1))));
      return ticks[idx];
    })
    .join("");
}

function bar(value: number, total: number, width: number): string {
  const pct = total <= 0 ? 0 : value / total;
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  return `▕${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}▏`;
}

function renderCard(title: string, body: string, tone: string = THEME.brand): string {
  return (
    `{bold}{${tone}-fg}· ${escapeTags(title)}{/${tone}-fg}{/bold}\n` +
    `{${tone}-fg}${"━".repeat(Math.max(22, Math.min(42, title.length + 12)))}{/${tone}-fg}\n` +
    `${body}`
  );
}

function renderSection(title: string, content: string, color: string): string {
  return (
    `{bold}{${color}-fg}  ▸ ${escapeTags(title)}{/${color}-fg}{/bold}\n` +
    `{${THEME.muted}-fg}  ${"─".repeat(Math.max(20, Math.min(36, title.length + 12)))}{/${THEME.muted}-fg}\n` +
    `${content}`
  );
}

function runStartTransition(panel: blessed.Widgets.BoxElement, mode: "lesson" | "test" | "custom"): Promise<void> {
  return new Promise((resolve) => {
    const frames = spinners.dots.frames;
    const startedAt = Date.now();
    let i = 0;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.floor((elapsed / UI.transitionInMs) * 100));
      panel.setContent(
        renderCard(
          `Starting ${mode.toUpperCase()}`,
          `{${THEME.accent}-fg}  ${frames[i % frames.length]}  Calibrating text lane and feedback board...{/${THEME.accent}-fg}\n` +
          `  ${progressBar(pct, 26)} {bold}${pct}%{/bold}`
        )
      );
      i += 1;
      panel.screen.render();
      if (elapsed >= UI.transitionInMs) {
        clearInterval(tick);
        resolve();
      }
    }, spinners.dots.interval);
  });
}

function runExitTransition(panel: blessed.Widgets.BoxElement, onDone: () => void): Promise<void> {
  return new Promise((resolve) => {
    const frames = spinners.line.frames;
    const startedAt = Date.now();
    let i = 0;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.floor((elapsed / UI.transitionOutMs) * 100));
      panel.setContent(
        renderCard(
          "Finalizing Run",
          `{${THEME.brand}-fg}  ${frames[i % frames.length]}  Scoring run, storing history, refreshing coach...{/${THEME.brand}-fg}\n` +
          `  ${progressBar(pct, 22)} {bold}${pct}%{/bold}`
        )
      );
      i += 1;
      panel.screen.render();
      if (elapsed >= UI.transitionOutMs) {
        clearInterval(tick);
        onDone();
        resolve();
      }
    }, spinners.line.interval);
  });
}
