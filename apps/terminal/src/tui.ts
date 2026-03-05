import blessed from "blessed";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import spinners from "cli-spinners";
import gradient from "gradient-string";
import stringWidth from "string-width";
import { initLip, Lipgloss } from "charsm";
import { composeAdaptiveDrill, getDifficultyConfig, getLessonsForDifficulty, makeParagraphTest, normalizeCustomText, pickQuote, type Difficulty, type Lesson } from "./core/content.js";
import type { RunResult } from "./core/typingEngine.js";
import { Storage, type TrainingProgress } from "./core/storage.js";
import { TypingSession } from "./core/typingEngine.js";
import { detectTerminalHost, DiagnosticsLogger, PerfTracker, runDoctor } from "./core/diagnostics.js";

const THEME = {
  bg: "black",
  text: "white",
  muted: "gray",
  brand: "cyan",
  accent: "yellow",
  ok: "green",
  bad: "red",
  borderPrimary: "cyan",
  borderSecondary: "magenta"
} as const;

const UI = {
  viewportChars: 210,
  liveTickerMs: 100,
  transitionInMs: 380,
  transitionOutMs: 320,
  toastMs: 1400
} as const;

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

  type GameLevel = "very-easy" | "easy" | "medium" | "hard" | "expert" | "insane";
  let selectedLevel: GameLevel = "easy";
  const perf = new PerfTracker();
  const logger = new DiagnosticsLogger(settings.diagnosticsEnabled);
  const forcedPerfHud = Boolean(options?.perfHud);

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

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    mouse: true,
    title: "Typing Master Terminal"
  });

  try {
    screen.program.enableMouse();
    // PowerShell/Windows can flood with mouse-motion events, causing lag.
    // Keep click/scroll support but avoid all-motion tracking there.
    if (process.platform === "win32") {
      screen.program.setMouse(
        { allMotion: false, vt200Mouse: true, x10Mouse: true, sgrMouse: true, sendFocus: false },
        true
      );
    } else {
      screen.program.setMouse(
        { allMotion: true, vt200Mouse: true, x10Mouse: true, sgrMouse: true, sendFocus: true },
        true
      );
    }
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
    label: " Modes ",
    tags: true,
    border: "line",
    keys: true,
    vi: true,
    mouse: true,
    style: {
      border: { fg: THEME.borderSecondary },
      item: { fg: THEME.text },
      selected: { bg: THEME.accent, fg: "black", bold: true }
    },
    items: []
  });

  const renderMenuItems = (): void => {
    menu.setItems([
      "Practice Training",
      "Lessons",
      "Typing Test",
      "Custom Test",
      "Stats",
      "Coach Insights",
      `Game Level (${selectedLevel.toUpperCase()})`,
      `Toggle Sound (${settings.sound ? "ON" : "OFF"})`,
      `Toggle Keyboard (${settings.showKeyboard ? "ON" : "OFF"})`,
      "Quit"
    ]);
  };

  const panel = blessed.box({
    parent: screen,
    top: 2,
    left: "26%",
    width: "74%",
    height: "100%-3",
    label: " Session ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    style: { border: { fg: THEME.borderPrimary }, fg: THEME.text, bg: THEME.bg },
    scrollbar: { ch: " ", style: { bg: THEME.borderSecondary } }
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
    content: "  ENTER Select    ESC Back    Ctrl+P Palette    F12 Reset    F3 Sound    F2 Keyboard    Q Quit  "
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
    const logo = gradient(["#22d3ee", "#a78bfa"])("Typing Master");
    const raw = `${logo} · ${profile.nickname} · ${selectedLevel.toUpperCase()} · Flow Mode`;
    const cols = typeof screen.width === "number" ? screen.width : 120;
    const clipped = clipAnsiAware(raw, Math.max(20, cols - 2));
    setHeaderContent(` ${clipped}`);
  };

  const renderIdleStats = (): void => {
    const s = storage.getStats90d();
    setStatsContent(
      ` {green-fg}Best ${s.bestWpm} WPM{/green-fg}  {yellow-fg}Avg ${s.avgWpm} WPM{/yellow-fg}  {magenta-fg}Accuracy ${s.avgAccuracy}%{/magenta-fg}  {cyan-fg}Runs ${s.totalRuns}{/cyan-fg}  Sound:${settings.sound ? "ON" : "OFF"}  Keyboard:${settings.showKeyboard ? "ON" : "OFF"}`
    );
  };

  const renderLiveStats = (wpm: number, accuracy: number, mistakes: number, progress: number): void => {
    setStatsContent(
      ` {green-fg}${wpm} WPM{/green-fg}  {yellow-fg}${accuracy}% ACC{/yellow-fg}  {red-fg}${mistakes} ERR{/red-fg}  {cyan-fg}${progress}%{/cyan-fg}  {white-fg}${selectedLevel.toUpperCase()}{/white-fg}`
    );
  };

  const renderHome = (): void => {
    resetPanel();
    renderMenuItems();
    panel.setLabel(" Session ");
    setPanelContent(
      renderCard(
        "{bold}{cyan-fg}Ready{/cyan-fg}{/bold}",
        "Minimal. Fast. Focused.\n\n" +
        "{white-fg}Pick a mode from the left menu.{/white-fg}\n\n" +
        "{yellow-fg}Target{/yellow-fg}: upcoming text\n" +
        "{white-fg}Output{/white-fg}: your typed stream with {green-fg}green{/green-fg}/{red-fg}red{/red-fg} feedback"
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
      const plain =
        `Initializing Typing Master\n\n` +
        `${frames[i % frames.length]}  Loading interface...\n` +
        `${progressBar(pct, 30)} ${pct}%\n\n` +
        `Powered by Blessed + charsm`;
      splash.setContent(lip ? lip.apply({ value: plain, id: "splash" }) : plain);
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
    panel.setLabel(` ${mode.toUpperCase()} `);

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
      renderLiveStats(live.netWpm, live.accuracy, snap.mistakes, progress);
      const viewport = createViewport(text, snap.cursor, UI.viewportChars);

      setPanelContent(
        renderSection("TARGET", renderTargetDiff(text, snap.typed, viewport), THEME.accent) +
        "\n\n" +
        renderSection("OUTPUT", renderTypedDiff(text, snap.typed, viewport), THEME.text) +
        "\n\n" +
        (settings.showKeyboard ? `{bold}Keyboard{/bold}\n${renderKeyboard(lastKeyPress, settings.keyAnimation)}\n\n` : "") +
        `{gray-fg}ESC exit{/gray-fg}`
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
      storage.addRun(result);
      if (settings.sound) playEndSound();
      onComplete?.(result);
      renderHeader();
      renderIdleStats();
      cleanupInput();
      const finalize = (): void => {
      panel.setLabel(" Result ");
      setPanelContent(
        lip
          ? lip.apply({
              value:
                `Run Complete\n\n` +
                `Net WPM: ${result.netWpm}\n` +
                `Accuracy: ${result.accuracy}%\n` +
                `Mistakes: ${result.mistakes}\n\n` +
                `Press any key to return`,
              id: "result"
            })
          : `{bold}{green-fg}Run Complete{/green-fg}{/bold}\n\n` +
            `Net WPM: {green-fg}${result.netWpm}{/green-fg}\n` +
            `Accuracy: {yellow-fg}${result.accuracy}%{/yellow-fg}\n` +
            `Mistakes: {red-fg}${result.mistakes}{/red-fg}\n\n` +
            `{gray-fg}Press any key to return{/gray-fg}`
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
    const chooser = blessed.list({
      parent: panel,
      width: "100%",
      height: "100%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      style: { selected: { bg: "cyan", fg: "black" } },
      items: lessons.map((l) => `${l.title} [${l.level}]`)
    });
    chooser.focus();

    const pick = (idx: number): void => {
      const lesson = lessons[idx];
      if (!lesson) return;
      chooser.destroy();
      runTypingMode("lesson", lesson.text, lesson.id, lesson.level);
    };

    chooser.on("select", (_item, idx) => pick(idx));
    chooser.on("action", (_item, idx) => pick(idx));
    chooser.on("click", () => {
      const selected = (chooser as unknown as { selected?: number }).selected;
      pick(typeof selected === "number" ? selected : 0);
    });

    screen.render();
  }

  function showTypingTest(): void {
    const level = getLevelProfile(selectedLevel);
    const cfg = getDifficultyConfig(level.difficulty);
    const wordCount = Math.max(12, cfg.wordCount + level.extraWords);
    const text = makeParagraphTest(level.difficulty, wordCount, Math.floor(Date.now() / 1000) + cfg.seedOffset);
    runTypingMode("test", text, `paragraph-${selectedLevel}-${Date.now()}`, level.difficulty);
  }

  function showCustomTest(): void {
    const cfg = getDifficultyConfig(getLevelProfile(selectedLevel).difficulty);
    const imported = path.join(os.homedir(), ".typing-master", "last-import.txt");
    let text = "paste custom text by running `typing-master import <file>` first";
    if (fs.existsSync(imported)) text = fs.readFileSync(imported, "utf8");
    text = normalizeCustomText(text, cfg.custom);
    if (!text) text = pickQuote();
    runTypingMode("custom", text, `custom-${selectedLevel}-${Date.now()}`, getLevelProfile(selectedLevel).difficulty);
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
      height: "70%",
      tags: true,
      border: "line",
      label: " Training Summary ",
      scrollable: true,
      alwaysScroll: true,
      style: { border: { fg: "cyan" } }
    });

    const actions = blessed.list({
      parent: panel,
      top: "70%",
      left: 0,
      width: "100%",
      height: "30%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: " Actions ",
      style: { selected: { bg: "green", fg: "black", bold: true } },
      items: [
        "Start Guided Drill",
        "Start Adaptive Drill",
        "Back to Home"
      ]
    });
    actions.focus();

    const drawSummary = (): void => {
      const summaryText =
        `{bold}{cyan-fg}Zero To Best Program{/cyan-fg}{/bold}\n\n` +
        `Tier: {yellow-fg}${progress.tier.toUpperCase()}{/yellow-fg}\n` +
        `Points: {green-fg}${progress.points}{/green-fg}` +
        (progress.tier !== "master" ? ` / ${nextTierAt}` : " (MAX)") +
        `\nCompleted Drills: ${progress.completedDrills}\n` +
        `Best WPM: ${progress.bestWpm}\nBest Accuracy: ${progress.bestAccuracy}%\n\n` +
        `Milestone Gate: ${coach.consistency >= 70 && progress.bestAccuracy >= 95 ? "{green-fg}PASS{/green-fg}" : "{red-fg}PENDING{/red-fg}"}\n` +
        `Next Drill: ${lesson ? `${lesson.title} [${lesson.level}]` : "No lesson available"}\n` +
        `Goal: Build from 0 to Master with consistency.`;
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

    drawSummary();
  }

  function showDifficultyPicker(): void {
    resetPanel();
    panel.setLabel(" Game Level ");
    const options: GameLevel[] = ["very-easy", "easy", "medium", "hard", "expert", "insane"];
    const chooser = blessed.list({
      parent: panel,
      width: "100%",
      height: "100%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      style: { selected: { bg: "magenta", fg: "white" } },
      items: options.map((level) => {
        const profile = getLevelProfile(level);
        const cfg = getDifficultyConfig(profile.difficulty);
        const words = Math.max(12, cfg.wordCount + profile.extraWords);
        return `${profile.label.toUpperCase()} (${words} words/test)`;
      })
    });

    chooser.select(options.indexOf(selectedLevel));
    chooser.focus();

    const pick = (idx: number): void => {
      const next = options[idx];
      if (!next) return;
      selectedLevel = next;
      chooser.destroy();
      renderHeader();
      renderIdleStats();
      panel.setLabel(" Session ");
      setPanelContent(`Level set to {bold}{cyan-fg}${selectedLevel.toUpperCase()}{/cyan-fg}{/bold}.`);
      screen.render();
    };

    chooser.on("select", (_item, idx) => pick(idx));
    chooser.on("action", (_item, idx) => pick(idx));
    chooser.on("click", () => {
      const selected = (chooser as unknown as { selected?: number }).selected;
      pick(typeof selected === "number" ? selected : 0);
    });

    screen.render();
  }

  function showStats(): void {
    resetPanel();
    panel.setLabel(" Stats ");
    const s = storage.getStats90d();
    const runs = storage.getRuns(60);
    const recent = [...runs].reverse().slice(-25);
    const wpmSeries = recent.map((r) => r.netWpm);
    const accSeries = recent.map((r) => r.accuracy);
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
      renderCard(
        "90 Day Summary",
        `{green-fg}Best{/green-fg}: ${s.bestWpm} WPM  ` +
        `{yellow-fg}Average{/yellow-fg}: ${s.avgWpm} WPM  ` +
        `{magenta-fg}Accuracy{/magenta-fg}: ${s.avgAccuracy}%  ` +
        `{cyan-fg}Consistency{/cyan-fg}: ${s.consistency}  ` +
        `Runs: ${s.totalRuns}`
      ) +
      "\n\n" +
      renderSection("WPM Trend", `{green-fg}${sparkline(wpmSeries)}{/green-fg}`, THEME.ok) +
      "\n" +
      renderSection("ACC Trend", `{magenta-fg}${sparkline(accSeries)}{/magenta-fg}`, "magenta") +
      "\n\n" +
      renderSection("Mode Split", modeLines || "{gray-fg}No run data{/gray-fg}", THEME.brand) +
      "\n\n" +
      renderSection("Recent Runs", recentRows || "{gray-fg}No recent runs{/gray-fg}", THEME.text)
    );

    screen.render();
  }

  function showCoachInsights(): void {
    resetPanel();
    panel.setLabel(" Coach Insights ");
    const coach = storage.getCoachInsights(50);
    const keys = coach.weakestKeys.length > 0
      ? coach.weakestKeys.map((k) => `${k.key}:${k.count}`).join(", ")
      : "No key mistake data yet";
    const bigrams = coach.weakestBigrams.length > 0
      ? coach.weakestBigrams.map((k) => `${k.bigram}:${k.count}`).join(", ")
      : "No bigram mistake data yet";
    setPanelContent(
      renderCard(
        "Coach",
        `Runs analyzed: ${coach.runsAnalyzed}\n` +
        `Consistency: ${coach.consistency}\n` +
        `Fatigue score: ${coach.fatigueScore}\n` +
        `Daily target: ${coach.dailyTarget}\n\n` +
        `Weakest keys: ${keys}\n` +
        `Weakest bigrams: ${bigrams}\n\n` +
        "{gray-fg}Tip: Use Practice Training -> Adaptive Drill{/gray-fg}"
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
      content: `{bold}{cyan-fg}Command Palette{/cyan-fg}{/bold}  {gray-fg}(quick actions){/gray-fg}`
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
        border: { fg: "magenta" },
        item: { fg: "white" },
        selected: { bg: "yellow", fg: "black", bold: true }
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
      content: "{gray-fg}Type to filter · Backspace edit · Enter select · Esc close{/gray-fg}"
    });
    hint.hide();
    palette.focus();

    const updateFilter = (): void => {
      const q = query.trim().toLowerCase();
      filtered = q.length === 0 ? [...actions] : actions.filter((a) => a.label.toLowerCase().includes(q));
      palette.setItems(filtered.length > 0 ? filtered.map((a) => a.label) : ["No matching actions"]);
      palette.select(0);
      title.setContent(
        `{bold}{cyan-fg}Command Palette{/cyan-fg}{/bold}  ` +
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

  menu.on("select", (_item, idx) => onMenuPick(idx));
  menu.on("action", (_item, idx) => onMenuPick(idx));
  menu.on("click", () => {
    const selected = (menu as unknown as { selected?: number }).selected;
    onMenuPick(typeof selected === "number" ? selected : 0);
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

function renderTargetDiff(target: string, typed: string, viewport: Viewport): string {
  const out: string[] = [];
  if (viewport.start > 0) out.push("{gray-fg}... {/gray-fg}");
  for (let i = viewport.start; i < viewport.end; i++) {
    const ch = escapeTags(target[i]);
    if (i < typed.length) {
      out.push(`{white-fg}${ch}{/white-fg}`);
    } else if (i === typed.length) {
      out.push(`{black-fg}{yellow-bg}${ch}{/yellow-bg}{/black-fg}`);
    } else {
      out.push(`{yellow-fg}${ch}{/yellow-fg}`);
    }
  }
  if (viewport.end < target.length) out.push("{gray-fg} ...{/gray-fg}");
  return out.join("");
}

function renderTypedDiff(target: string, typed: string, viewport: Viewport): string {
  if (!typed) return "{white-fg}(start typing...){/white-fg}";
  const out: string[] = [];
  if (viewport.start > 0 && typed.length > viewport.start) out.push("{gray-fg}... {/gray-fg}");
  for (let i = viewport.start; i < Math.min(viewport.end, typed.length); i++) {
    const c = escapeTags(typed[i]);
    if (typed[i] === target[i]) out.push(`{green-fg}${c}{/green-fg}`);
    else out.push(`{red-fg}${c}{/red-fg}`);
  }
  if (typed.length > viewport.end) out.push("{gray-fg} ...{/gray-fg}");
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
        cells.push(lastKeyPress?.correct ? `{black-fg}{green-bg}[${escapeTags(label)}]{/green-bg}{/black-fg}` : `{white-fg}{red-bg}[${escapeTags(label)}]{/red-bg}{/white-fg}`);
      } else {
        cells.push(`{black-fg}{white-bg}[${escapeTags(label)}]{/white-bg}{/black-fg}`);
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
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}]`;
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
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}]`;
}

function renderCard(title: string, body: string): string {
  return (
    `{bold}{${THEME.brand}-fg}${title}{/${THEME.brand}-fg}{/bold}\n` +
    `{${THEME.muted}-fg}${"─".repeat(36)}{/${THEME.muted}-fg}\n` +
    `${body}`
  );
}

function renderSection(title: string, content: string, color: string): string {
  return (
    `{bold}{${color}-fg}${title}{/${color}-fg}{/bold}\n` +
    `{${THEME.muted}-fg}${"·".repeat(28)}{/${THEME.muted}-fg}\n` +
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
          `{${THEME.accent}-fg}${frames[i % frames.length]} Preparing session...{/${THEME.accent}-fg}\n` +
          `${progressBar(pct, 26)} ${pct}%`
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
          `{${THEME.brand}-fg}${frames[i % frames.length]} Scoring and saving...{/${THEME.brand}-fg}\n` +
          `${progressBar(pct, 22)}`
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
