# @openclaw-tools/morning-briefing

Local morning briefing CLI for [OpenClaw](https://openclaw.dev) — weather, calendar, news, reminders with zero API token cost.

## Install

```bash
npm install -g @openclaw-tools/morning-briefing
```

## Usage

```bash
briefing                          # full briefing (all enabled modules)
briefing weather                  # weather only (free)
briefing calendar                 # calendar events (licensed)
briefing news                     # RSS headlines (licensed)
briefing reminders                # due reminders (licensed)
briefing --format compact         # one-line summary
briefing --format json            # machine-readable JSON
briefing --location "New York"    # override location
briefing config init              # interactive setup wizard
briefing activate <license-key>   # activate license
briefing status                   # check license status
```

## Configuration

Config file: `~/.config/morning-briefing/config.json`

Run `briefing config init` for interactive setup.

## Requirements

- **Node.js** >= 20.0.0
- **macOS** for Calendar and Reminders modules (weather and news work on all platforms)

## License

MIT
