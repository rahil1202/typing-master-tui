# Typing Master Terminal

Cross-platform terminal clone of Typing Master / TypingTom with local profiles, strict typing engine, lessons/tests/custom text, stats, and hosted race server.

## Monorepo Layout

- `apps/terminal`: full-screen terminal app + CLI (`typing-master`)
- `apps/race-server`: hosted websocket matchmaking and leaderboard API
- `packages/typing-engine`: scoring, strict input handling, trace hashing
- `packages/content`: built-in lessons and test text generators
- `packages/protocol`: shared events/schemas
- `packages/storage`: SQLite persistence, 90-day retention, import/export

## Quick Start

```bash
npm install
npm run build
npm run dev
```

Launch terminal app:

```bash
npm run -w @typing-master/terminal dev
```

Start race server:

```bash
npm run -w @typing-master/race-server dev
```

CLI commands:

```bash
typing-master
typing-master import ./my-custom-text.txt
typing-master export --format csv
typing-master race --nickname dc --server ws://localhost:8080
```

## Retention

- Local history defaults to 90 days and is pruned on app launch.
- Server leaderboard endpoint supports daily/weekly views.

## Test

```bash
npm test
```
