export type QueueJoinEvent = {
  type: "queue.join";
  nickname: string;
};

export type QueueMatchedEvent = {
  type: "queue.matched";
  raceId: string;
  textId: string;
  target: string;
  players: string[];
};

export type RaceCountdownEvent = {
  type: "race.countdown";
  raceId: string;
  startsInMs: number;
};

export type RaceStartEvent = {
  type: "race.start";
  raceId: string;
  startedAt: number;
};

export type RaceProgressEvent = {
  type: "race.progress";
  raceId: string;
  nickname: string;
  progress: number;
  wpm: number;
};

export type RaceFinishEvent = {
  type: "race.finish";
  raceId: string;
  nickname: string;
  netWpm: number;
  accuracy: number;
  inputTraceHash: string;
};

export type RaceResultEvent = {
  type: "race.result";
  raceId: string;
  standings: Array<{ nickname: string; netWpm: number; accuracy: number; place: number }>;
};

export type RaceErrorEvent = {
  type: "race.error";
  message: string;
};

export type ClientEvent = QueueJoinEvent | RaceProgressEvent | RaceFinishEvent;
export type ServerEvent =
  | QueueMatchedEvent
  | RaceCountdownEvent
  | RaceStartEvent
  | RaceResultEvent
  | RaceErrorEvent
  | RaceProgressEvent;

export interface Settings {
  theme: "default" | "high-contrast";
  sound: boolean;
  showKeyboard: boolean;
  keyAnimation: boolean;
  caretStyle: "block" | "line";
  strictMode: boolean;
  historyRetentionDays: number;
  performanceMode: boolean;
  reducedMotion: boolean;
  toastLevel: "off" | "minimal" | "verbose";
  inputStrategy: "auto" | "raw" | "keypress";
  preferredTerminalHost: "auto" | "windows-terminal" | "powershell" | "iterm2" | "terminal-app" | "other";
  onboardingCompleted: boolean;
  diagnosticsEnabled: boolean;
}
