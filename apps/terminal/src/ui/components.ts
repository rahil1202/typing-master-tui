import blessed from "blessed";
import { UI_COLORS } from "./theme.js";

export function createButton(parent: blessed.Widgets.Node, label: string, left: number | string, top: number | string): blessed.Widgets.BoxElement {
  return blessed.box({
    parent,
    mouse: true,
    keys: true,
    shrink: true,
    padding: { left: 1, right: 1 },
    tags: true,
    left,
    top,
    content: ` {bold}${label}{/bold} `,
    border: "line",
    style: {
      bg: UI_COLORS.panelAltBg,
      fg: UI_COLORS.text,
      border: { fg: UI_COLORS.border },
      focus: { bg: UI_COLORS.accent, fg: UI_COLORS.textInverted, border: { fg: UI_COLORS.accentStrong } },
      hover: { bg: UI_COLORS.accentStrong, fg: UI_COLORS.textInverted, border: { fg: UI_COLORS.accentStrong } }
    }
  });
}

export function createSelector(
  parent: blessed.Widgets.Node,
  label: string,
  items: string[],
  left: number | string,
  top: number | string
): blessed.Widgets.ListElement {
  return blessed.list({
    parent,
    label: ` ${label} `,
    left,
    top,
    width: "33%-1",
    height: 7,
    border: "line",
    mouse: true,
    keys: true,
    vi: true,
    items,
    style: {
      bg: UI_COLORS.panelAltBg,
      fg: UI_COLORS.text,
      border: { fg: UI_COLORS.border },
      selected: { bg: UI_COLORS.accent, fg: UI_COLORS.textInverted, bold: true },
      hover: { bg: UI_COLORS.accentStrong, fg: UI_COLORS.textInverted }
    }
  });
}

export function createLeaderboard(parent: blessed.Widgets.Node, left: number | string, top: number | string): blessed.Widgets.ListElement {
  return blessed.list({
    parent,
    label: " Leaderboard ",
    left,
    top,
    width: "100%-2",
    height: "100%-16",
    border: "line",
    mouse: true,
    keys: true,
    vi: true,
    items: [
      "1. Ava    121 WPM  99.1%",
      "2. Kai    114 WPM  98.8%",
      "3. Noor   108 WPM  98.2%",
      "4. Liam   104 WPM  97.9%",
      "5. You     97 WPM  97.1%"
    ],
    style: {
      bg: UI_COLORS.panelBg,
      fg: UI_COLORS.text,
      border: { fg: UI_COLORS.border },
      selected: { bg: UI_COLORS.accent, fg: UI_COLORS.textInverted, bold: true },
      hover: { bg: UI_COLORS.accentStrong, fg: UI_COLORS.textInverted }
    },
    scrollbar: { ch: " ", style: { bg: UI_COLORS.accent } },
    scrollable: true,
    alwaysScroll: true
  });
}
