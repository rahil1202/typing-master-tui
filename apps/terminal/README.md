# typing-master-terminal

Fast, full-screen typing trainer for the terminal.

## Install

```bash
npm install -g typing-master-terminal
```

## Run

```bash
typing-master
```

## Modern TUI layout

The default `typing-master` UI uses a modern full-screen Blessed layout with:

- Header (title + live profile stats)
- Left sidebar menu (`Practice`, `Test`, `Race`, `Stats`, `Settings`)
- Main content panel with clickable controls
- Footer shortcut bar

### Mouse + keyboard interaction

- Click menu items, selectors, list rows, and buttons
- Scroll main panel/leaderboard with mouse wheel
- Arrow keys navigate focused lists
- `Enter` activates selected item
- `Tab` / `Shift+Tab` cycles focus

## Commands

```bash
typing-master                # launch blessed TUI
typing-master play-ink       # launch ink UI
typing-master import <file>  # import custom text
typing-master export --format json|csv
typing-master race --nickname <name> --server ws://localhost:8080
```

## Data

Local data is stored in:

- `~/.typing-master/typing-master.db`
- `~/.typing-master/last-import.txt`

## Requirements

- Node.js 20+

## Compatibility Matrix

| Platform | Host Terminal | Status | Recommended input strategy |
|---|---|---|---|
| Windows | Windows Terminal + PowerShell | Supported | `raw` |
| Windows | Legacy PowerShell host | Supported (reduced motion recommended) | `raw` |
| macOS | iTerm2 | Supported | `keypress` |
| macOS | Terminal.app | Supported | `keypress` |
| Linux | GNOME/Konsole/Alacritty | Supported | `keypress` |
