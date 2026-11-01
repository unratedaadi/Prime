# PRIME — Jarvis the local macOS voice assistant

PRIME is a local-first assistant for one Mac. It combines a React/Electron Control Center, loopback-only Node agent, native Swift wake listener, local Ollama conversation, and a native window/display helper.

For setup, permissions, commands, privacy boundaries, and troubleshooting, read [setup.md](setup.md) and [USING.md](USING.md).

## Current capabilities

- Wake with **Prime** or **Hey Prime** and use typed or spoken commands.
- Local conversation plus explicitly saved personal memory.
- Open/quit installed apps, list/open Chrome profiles, and launch built-in work/coding setups.
- Google/YouTube search, Music/Spotify controls, local notes, timers, time/battery, volume, memory, and storage status.
- List displays and move a running app to the internal or external display after Accessibility permission.
- Confirmation-gated WhatsApp voice calls for a uniquely matched local Contact.

The full external-display theatre view, custom workspace editor, document/PDF and clipboard tools, Calendar/Reminders, meeting tools, and proactive monitoring are planned rather than implemented. See the [Command Center design](docs/superpowers/specs/2026-11-02-prime-command-center-design.md).

## Development

```bash
npm install
npm test
npm run lint
npm run build
```

Useful commands:

```bash
npm run dev
npm run agent:mac:install
npm run wake:mac:build
npm run wake:mac:install
npm run window-manager:mac:build
npm run desktop:install
```

The agent only listens on `127.0.0.1`, authenticates commands using a local private key, and uses an allowlist. PRIME does not provide arbitrary shell execution, arbitrary file access, account access, or cloud processing by default.

## Author

Made by [Aaditya Nahar Jain](https://github.com/unratedaadi/).
# Prime
