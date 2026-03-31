import blessed from "blessed";
import { UI_COLORS } from "./theme.js";

export interface AppLayout {
  root: blessed.Widgets.BoxElement;
  frame: blessed.Widgets.BoxElement;
  header: blessed.Widgets.BoxElement;
  sidebar: blessed.Widgets.ListElement;
  content: blessed.Widgets.BoxElement;
  footer: blessed.Widgets.BoxElement;
}

export function createMainLayout(screen: blessed.Widgets.Screen, sidebarItems: string[]): AppLayout {
  const root = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    style: { bg: UI_COLORS.appBg }
  });

  const frame = blessed.box({
    parent: root,
    top: "center",
    left: "center",
    width: "96%",
    height: "94%",
    border: "line",
    style: { bg: UI_COLORS.appBg, border: { fg: UI_COLORS.border } }
  });

  const header = blessed.box({
    parent: frame,
    top: 0,
    left: 1,
    width: "100%-2",
    height: 3,
    tags: true,
    style: { bg: UI_COLORS.panelBg, fg: UI_COLORS.text, bold: true }
  });

  const sidebar = blessed.list({
    parent: frame,
    top: 3,
    left: 1,
    width: 26,
    height: "100%-7",
    label: " Menu ",
    border: "line",
    tags: true,
    mouse: true,
    keys: true,
    vi: true,
    items: sidebarItems,
    style: {
      bg: UI_COLORS.panelBg,
      fg: UI_COLORS.text,
      border: { fg: UI_COLORS.border },
      selected: { bg: UI_COLORS.accent, fg: "black", bold: true },
      item: { fg: UI_COLORS.text },
      hover: { bg: UI_COLORS.accentStrong, fg: "black" }
    }
  });

  const content = blessed.box({
    parent: frame,
    top: 3,
    left: 28,
    width: "100%-29",
    height: "100%-7",
    label: " Main ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    scrollbar: { ch: " ", style: { bg: UI_COLORS.accent } },
    style: { bg: UI_COLORS.panelBg, fg: UI_COLORS.text, border: { fg: UI_COLORS.border } }
  });

  const footer = blessed.box({
    parent: frame,
    bottom: 0,
    left: 1,
    width: "100%-2",
    height: 2,
    tags: true,
    style: { bg: UI_COLORS.panelAltBg, fg: UI_COLORS.muted },
    content: " ↑/↓ navigate · Enter select · Click select/focus · Wheel scroll · q quit "
  });

  const updateLayout = (): void => {
    const cols = typeof screen.width === "number" ? screen.width : 120;
    const compact = cols < 100;
    sidebar.width = compact ? 22 : 26;
    content.left = compact ? 24 : 28;
    content.width = compact ? "100%-25" : "100%-29";
  };

  screen.on("resize", () => {
    updateLayout();
    screen.render();
  });
  updateLayout();

  return { root, frame, header, sidebar, content, footer };
}
