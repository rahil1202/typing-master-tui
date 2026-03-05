import blessed from "blessed";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import spinners from "cli-spinners";
import gradient from "gradient-string";
import stringWidth from "string-width";
import { initLip, Lipgloss } from "charsm";
import { getDifficultyConfig, getLessonsForDifficulty, makeWordTest, normalizeCustomText, pickQuote, type Difficulty, type Lesson } from "@typing-master/content";
import type { RunResult } from "@typing-master/typing-engine";
import { Storage, type TrainingProgress } from "@typing-master/storage";
import { TypingSession } from "@typing-master/typing-engine";

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

export function runTui(dbPath: string): void {
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
  if (settings.showKeyboard) {
    settings = { ...settings, showKeyboard: false };
    storage.saveSettings(settings);
  }

  type GameLevel = "very-easy" | "easy" | "medium" | "hard" | "expert" | "insane";
  let selectedLevel: GameLevel = "easy";

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
    screen.program.setMouse(
      { allMotion: true, vt200Mouse: true, x10Mouse: true, sgrMouse: true, sendFocus: true },
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
    style: { bg: "blue", fg: "white" }
  });

  const statsBar = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: "black", fg: "white" }
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
      border: { fg: "cyan" },
      item: { fg: "white" },
      selected: { bg: "cyan", fg: "black", bold: true }
    },
    items: ["Practice Training", "Lessons", "Typing Test", "Custom Test", "Stats", "Game Level", "Toggle Sound", "Toggle Keyboard", "Quit"]
  });

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
    style: { border: { fg: "cyan" }, fg: "white", bg: "black" },
    scrollbar: { ch: " ", style: { bg: "cyan" } }
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: "blue", fg: "white" },
    content: " Enter select  ·  ESC back  ·  F3 sound  ·  F2 keyboard  ·  q quit "
  });

  const renderHeader = (): void => {
    const logo = gradient(["#22d3ee", "#a78bfa"])("Typing Master");
    const raw = `${logo} · ${profile.nickname} · ${selectedLevel.toUpperCase()} · Flow Mode`;
    const cols = typeof screen.width === "number" ? screen.width : 120;
    const clipped = clipAnsiAware(raw, Math.max(20, cols - 2));
    header.setContent(
      ` ${clipped}`
    );
  };

  const renderIdleStats = (): void => {
    const s = storage.getStats90d();
    statsBar.setContent(
      ` {green-fg}Best ${s.bestWpm} WPM{/green-fg}  {yellow-fg}Avg ${s.avgWpm} WPM{/yellow-fg}  {magenta-fg}Accuracy ${s.avgAccuracy}%{/magenta-fg}  {cyan-fg}Runs ${s.totalRuns}{/cyan-fg}  Sound:${settings.sound ? "ON" : "OFF"}  Keyboard:${settings.showKeyboard ? "ON" : "OFF"}`
    );
  };

  const renderLiveStats = (wpm: number, accuracy: number, mistakes: number, progress: number): void => {
    statsBar.setContent(
      ` {green-fg}${wpm} WPM{/green-fg}  {yellow-fg}${accuracy}% ACC{/yellow-fg}  {red-fg}${mistakes} ERR{/red-fg}  {cyan-fg}${progress}%{/cyan-fg}  {white-fg}${selectedLevel.toUpperCase()}{/white-fg}`
    );
  };

  const renderHome = (): void => {
    panel.setLabel(" Session ");
    panel.setScroll(0);
    panel.setContent(
      "{bold}{cyan-fg}Ready{/cyan-fg}{/bold}\n\n" +
      "Select a mode on the left.\n\n" +
      "{yellow-fg}Target text{/yellow-fg} stays warm yellow.\n" +
      "Typed output turns {green-fg}green{/green-fg} for correct and {red-fg}red{/red-fg} for wrong."
    );
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

  function runTypingMode(
    mode: "lesson" | "test" | "custom",
    text: string,
    textId: string,
    difficulty: Difficulty,
    onComplete?: (result: RunResult) => void
  ): void {
    panel.setLabel(` ${mode.toUpperCase()} `);
    panel.setScroll(0);

    const session = new TypingSession(text, false);
    let lastKeyPress: { label: string; correct: boolean; at: number } | null = null;
    let running = true;
    let dirty = true;
    const startedAt = Date.now();
    let lastSig = "";
    let lastSigAt = 0;

    const draw = (): void => {
      if (!running) return;
      if (!dirty) return;
      const snap = session.snapshot;
      const elapsed = Math.max(1, Date.now() - startedAt);
      const live = computeLiveMetrics(snap.typed.length, snap.correctChars, snap.mistakes, elapsed);
      const progress = Math.floor((snap.cursor / Math.max(1, text.length)) * 100);
      renderLiveStats(live.netWpm, live.accuracy, snap.mistakes, progress);

      panel.setContent(
        `{bold}{yellow-fg}Target{/yellow-fg}{/bold}\n${renderTargetDiff(text, snap.typed)}\n\n` +
        `{bold}{white-fg}Output{/white-fg}{/bold}\n${renderTypedDiff(text, snap.typed)}\n\n` +
        (settings.showKeyboard ? `{bold}Keyboard{/bold}\n${renderKeyboard(lastKeyPress, settings.keyAnimation)}\n\n` : "") +
        `{gray-fg}ESC exit{/gray-fg}`
      );
      dirty = false;
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
      panel.setLabel(" Result ");
      panel.setContent(
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
      cleanupInput();
      const returnHome = (): void => renderHome();
      screen.once("keypress", returnHome);
      screen.once("mousedown", returnHome);
      // Fallback so user is never stuck on result screen.
      setTimeout(() => {
        const isDestroyed = Boolean((screen as unknown as { destroyed?: boolean }).destroyed);
        if (!isDestroyed) renderHome();
      }, 1500);
    };

    const onKeyEvent = (key: { name?: string; sequence?: string }): void => {
      if (!running) return;
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
        renderHeader();
        dirty = true;
        draw();
        return;
      }
      if (key.name === "f2") {
        settings = { ...settings, showKeyboard: !settings.showKeyboard };
        storage.saveSettings(settings);
        renderHeader();
        dirty = true;
        draw();
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
        if (settings.sound && !correct) playWrongSound();
      } else {
        return;
      }

      dirty = true;
      draw();
      if (session.snapshot.done) finish();
    };

    const keypressHandler = (_ch: string, key: blessed.Widgets.Events.IKeyEventArg): void => {
      onKeyEvent({ name: key.name, sequence: key.sequence as string | undefined });
    };

    let rawDataHandler: ((buf: Buffer) => void) | null = null;
    if (process.platform === "win32") {
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

    const paintLoop = setInterval(() => {
      if (!running) {
        clearInterval(paintLoop);
        return;
      }
      draw();
    }, 16);

    dirty = true;
    draw();
  }

  function showLessons(): void {
    const lessons = getLessonsForDifficulty(getLevelProfile(selectedLevel).difficulty);
    panel.setLabel(" Lessons ");
    panel.setScroll(0);
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
    const text = makeWordTest(wordCount, Math.floor(Date.now() / 1000) + cfg.seedOffset);
    runTypingMode("test", text, `words-${selectedLevel}-${Date.now()}`, level.difficulty);
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
    const progress = storage.getTrainingProgress();
    const targetDifficulty = trainingTierToDifficulty(progress.tier);
    const pool = getLessonsForDifficulty(targetDifficulty);
    const lesson = pool.length > 0 ? pool[progress.completedDrills % pool.length] : null;
    const nextTierAt =
      progress.tier === "rookie" ? 150 :
      progress.tier === "cadet" ? 350 :
      progress.tier === "pro" ? 700 :
      progress.tier === "elite" ? 1100 : progress.points;

    panel.setLabel(" Practice Training ");
    panel.setScroll(0);

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
    panel.setLabel(" Game Level ");
    panel.setScroll(0);
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
      panel.setContent(`Level set to {bold}{cyan-fg}${selectedLevel.toUpperCase()}{/cyan-fg}{/bold}.`);
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
    const s = storage.getStats90d();
    const runs = storage.getRuns(20);
    panel.setLabel(" Stats ");
    panel.setContent(
      `{bold}{cyan-fg}90 Day Stats{/cyan-fg}{/bold}\n\n` +
      `{green-fg}Best{/green-fg}: ${s.bestWpm} WPM\n` +
      `{yellow-fg}Average{/yellow-fg}: ${s.avgWpm} WPM\n` +
      `{magenta-fg}Accuracy{/magenta-fg}: ${s.avgAccuracy}%\n` +
      `{blue-fg}Consistency{/blue-fg}: ${s.consistency}\n` +
      `Runs: ${s.totalRuns}\n\n` +
      runs.slice(0, 10).map((r, i) => `${String(i + 1).padStart(2, "0")}. ${r.netWpm} WPM · ${r.accuracy}%`).join("\n")
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
        showDifficultyPicker();
        break;
      case 6:
        settings = { ...settings, sound: !settings.sound };
        storage.saveSettings(settings);
        renderHeader();
        renderIdleStats();
        screen.render();
        break;
      case 7:
        settings = { ...settings, showKeyboard: !settings.showKeyboard };
        storage.saveSettings(settings);
        renderHeader();
        renderIdleStats();
        screen.render();
        break;
      default:
        storage.close();
        screen.destroy();
        process.exit(0);
    }
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
    renderHeader();
    renderIdleStats();
    screen.render();
  });

  screen.key(["f2"], () => {
    settings = { ...settings, showKeyboard: !settings.showKeyboard };
    storage.saveSettings(settings);
    renderHeader();
    renderIdleStats();
    screen.render();
  });

  renderHeader();
  renderIdleStats();
  renderStartupSplash(() => {
    menu.focus();
    renderHome();
  });
}

function renderTargetDiff(target: string, typed: string): string {
  const out: string[] = [];
  for (let i = 0; i < target.length; i++) {
    const ch = escapeTags(target[i]);
    if (i < typed.length) {
      out.push(`{white-fg}${ch}{/white-fg}`);
    } else if (i === typed.length) {
      out.push(`{black-fg}{yellow-bg}${ch}{/yellow-bg}{/black-fg}`);
    } else {
      out.push(`{yellow-fg}${ch}{/yellow-fg}`);
    }
  }
  return out.join("");
}

function renderTypedDiff(target: string, typed: string): string {
  if (!typed) return "{white-fg}(start typing...){/white-fg}";
  const out: string[] = [];
  for (let i = 0; i < typed.length; i++) {
    const c = escapeTags(typed[i]);
    if (typed[i] === target[i]) out.push(`{green-fg}${c}{/green-fg}`);
    else out.push(`{red-fg}${c}{/red-fg}`);
  }
  return out.join("");
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
