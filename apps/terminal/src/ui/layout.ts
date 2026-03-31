import blessed from "blessed";
import { UI_COLORS } from "./theme.js";

const DEFAULT_SCREEN_WIDTH = 120;
const COMPACT_THRESHOLD = 100;
const SIDEBAR_WIDTH_DEFAULT = 26;
const SIDEBAR_WIDTH_COMPACT = 22;
const CONTENT_LEFT_DEFAULT = 28;
const CONTENT_LEFT_COMPACT = 24;
const CONTENT_WIDTH_DEFAULT = "100%-29";
const CONTENT_WIDTH_COMPACT = "100%-25";

export interface AppLayout {
  root: blessed.Widgets.BoxElement;
  frame: blessed.Widgets.BoxElement;
  header: blessed.Widgets.BoxElement;
  sidebar: blessed.Widgets.ListElement;
  content: blessed.Widgets.BoxElement;
  footer: blessed.Widgets.BoxElement;
}

interface LayoutMetrics {
  sidebarWidth: number;
  contentLeft: number;
  contentWidth: string;
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
      selected: { bg: UI_COLORS.accent, fg: UI_COLORS.textInverted, bold: true },
      item: { fg: UI_COLORS.text },
      hover: { bg: UI_COLORS.accentStrong, fg: UI_COLORS.textInverted }
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

  const applyLayoutMetrics = (metrics: LayoutMetrics): void => {
    sidebar.width = metrics.sidebarWidth;
    content.left = metrics.contentLeft;
    content.width = metrics.contentWidth;
  };

  const updateLayout = (): void => {
    const cols = typeof screen.width === "number" ? screen.width : DEFAULT_SCREEN_WIDTH;
    const compact = cols < COMPACT_THRESHOLD;
    const metrics: LayoutMetrics = compact
      ? {
          sidebarWidth: SIDEBAR_WIDTH_COMPACT,
          contentLeft: CONTENT_LEFT_COMPACT,
          contentWidth: CONTENT_WIDTH_COMPACT
        }
      : {
          sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
          contentLeft: CONTENT_LEFT_DEFAULT,
          contentWidth: CONTENT_WIDTH_DEFAULT
        };
    applyLayoutMetrics(metrics);
  };

  screen.on("resize", () => {
    updateLayout();
    screen.render();
  });
  updateLayout();

  return { root, frame, header, sidebar, content, footer };
}
