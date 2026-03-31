import blessed from "blessed";
import os from "node:os";
import { Storage } from "./core/storage.js";
import { createButton, createLeaderboard, createSelector } from "./ui/components.js";
import { createMainLayout } from "./ui/layout.js";
import { UI_COLORS } from "./ui/theme.js";

const MENU_ITEMS = ["Practice", "Test", "Race", "Stats", "Settings"];

export function runTui(dbPath: string, _options?: { perfHud?: boolean }): void {
  const storage = new Storage(dbPath);
  const profile = storage.getOrCreateProfile(os.userInfo().username || "Guest");
  const stats = storage.getStats90d();

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    mouse: true,
    title: "Typing Master TUI"
  });

  try {
    screen.program.enableMouse();
    screen.program.setMouse(
      { allMotion: false, vt200Mouse: true, x10Mouse: true, sgrMouse: true, sendFocus: false },
      true
    );
  } catch {
    // Keep keyboard-only fallback usable if mouse tracking is unavailable.
  }

  const { header, sidebar, content } = createMainLayout(screen, MENU_ITEMS);
  header.setContent(
    `{bold}{${UI_COLORS.accent}-fg}Typing Master{/${UI_COLORS.accent}-fg}{/bold}\n` +
    `{${UI_COLORS.muted}-fg}Profile:{/${UI_COLORS.muted}-fg} ${profile.nickname}  ·  Best ${stats.bestWpm} WPM  ·  Avg ${stats.avgWpm} WPM  ·  Acc ${stats.avgAccuracy}%`
  );

  const title = blessed.box({
    parent: content,
    top: 0,
    left: 1,
    width: "100%-2",
    height: 3,
    tags: true,
    style: { bg: UI_COLORS.panelBg, fg: UI_COLORS.text, bold: true },
    content: "{bold}Dashboard{/bold}\n{gray-fg}Modern, mouse-first typing UI{/gray-fg}"
  });

  const startButton = createButton(content, "Start Test", 1, 3);
  const selectorRow = blessed.box({
    parent: content,
    top: 6,
    left: 1,
    width: "100%-2",
    height: 7,
    style: { bg: UI_COLORS.panelBg }
  });

  const difficulty = createSelector(selectorRow, "Difficulty", ["Easy", "Medium", "Hard", "Expert"], 0, 0);
  const language = createSelector(selectorRow, "Language", ["English", "Spanish", "French"], "33%", 0);
  const profileSelector = createSelector(selectorRow, "Profile", [profile.nickname, "Guest", "Speedster"], "66%", 0);
  const leaderboard = createLeaderboard(content, 1, 14);

  const status = blessed.box({
    parent: content,
    bottom: 0,
    left: 1,
    width: "100%-2",
    height: 1,
    tags: true,
    style: { bg: UI_COLORS.panelBg, fg: UI_COLORS.muted },
    content: " Ready"
  });

  const updateStatus = (text: string): void => {
    status.setContent(` ${text}`);
    screen.render();
  };

  const focusables: blessed.Widgets.BlessedElement[] = [
    sidebar,
    startButton,
    difficulty,
    language,
    profileSelector,
    leaderboard
  ];

  for (const widget of focusables) {
    widget.on("click", () => {
      widget.focus();
      updateStatus(`Focused: ${(widget as unknown as { options?: { label?: string } }).options?.label ?? "component"}`);
    });
  }

  sidebar.on("select", (_item, idx) => {
    title.setContent(`{bold}${MENU_ITEMS[idx] ?? "Dashboard"}{/bold}\n{gray-fg}Use Enter or click to interact{/gray-fg}`);
    updateStatus(`Selected menu: ${MENU_ITEMS[idx] ?? "Unknown"}`);
  });

  difficulty.on("select", (_item, idx) => updateStatus(`Difficulty: ${difficulty.getItem(idx)?.getText() ?? "n/a"}`));
  language.on("select", (_item, idx) => updateStatus(`Language: ${language.getItem(idx)?.getText() ?? "n/a"}`));
  profileSelector.on("select", (_item, idx) => updateStatus(`Profile: ${profileSelector.getItem(idx)?.getText() ?? "n/a"}`));
  leaderboard.on("select", (_item, idx) => updateStatus(`Leaderboard row ${idx + 1} selected`));

  const runStartAction = (): void => {
    updateStatus("Start Test clicked · opening Test screen");
    sidebar.select(1);
    title.setContent("{bold}Test{/bold}\n{gray-fg}Example screen: test setup ready{/gray-fg}");
    screen.render();
  };
  startButton.on("click", runStartAction);
  startButton.key(["enter"], runStartAction);

  content.on("wheelup", () => {
    content.scroll(-2);
    screen.render();
  });
  content.on("wheeldown", () => {
    content.scroll(2);
    screen.render();
  });

  screen.key(["tab"], () => {
    const idx = focusables.findIndex((el) => el === screen.focused);
    const next = focusables[(idx + 1 + focusables.length) % focusables.length];
    next.focus();
    screen.render();
  });
  screen.key(["S-tab"], () => {
    const idx = focusables.findIndex((el) => el === screen.focused);
    const next = focusables[(idx - 1 + focusables.length) % focusables.length];
    next.focus();
    screen.render();
  });

  screen.key(["q", "C-c"], () => {
    storage.close();
    screen.destroy();
    process.exit(0);
  });

  sidebar.focus();
  screen.render();
}
