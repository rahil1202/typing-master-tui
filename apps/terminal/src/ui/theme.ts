export const THEME = {
  nord0: "#2E3440",
  nord1: "#3B4252",
  nord2: "#434C5E",
  nord3: "#4C566A",
  nord4: "#D8DEE9",
  nord5: "#E5E9F0",
  nord6: "#ECEFF4",
  nord7: "#8FBCBB",
  nord8: "#88C0D0",
  nord9: "#81A1C1",
  nord10: "#5E81AC",
  nord11: "#BF616A",
  nord12: "#D08770",
  nord13: "#EBCB8B",
  nord14: "#A3BE8C",
  nord15: "#B48EAD"
} as const;

export const UI_COLORS = {
  appBg: THEME.nord0,
  panelBg: THEME.nord1,
  panelAltBg: THEME.nord2,
  text: THEME.nord6,
  textInverted: THEME.nord0,
  muted: THEME.nord4,
  border: THEME.nord3,
  accent: THEME.nord8,
  accentStrong: THEME.nord7,
  success: THEME.nord14,
  warning: THEME.nord13
} as const;
