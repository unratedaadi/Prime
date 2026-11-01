# PRIME Setup Guide

This guide covers the first-time installation and permissions needed to run PRIME on a Mac.

## Requirements

- macOS with an active user session
- A local Ollama install and a downloaded model for conversation
- Google Chrome and/or WhatsApp if you want browser and calling features
- Accessibility and microphone permissions granted to the PRIME helper apps

## Install PRIME

From the project root, run:

```bash
npm install
npm run agent:mac:install
npm run wake:mac:build
npm run wake:mac:install
npm run window-manager:mac:build
npm run desktop:install
```

This installs the local agent, wake listener, dashboard, and window helper used by PRIME.

## Grant macOS permissions

Open System Settings → Privacy & Security and enable the required permissions for the installed PRIME helpers:

- Microphone: required for PRIME Wake Listener
- Speech Recognition: required for PRIME Wake Listener
- Accessibility: required for PRIME Window Manager to move apps between displays

Depending on your setup, macOS may also ask for Contacts, Automation, or additional Accessibility access for WhatsApp controls.

## Launch PRIME

Open the PRIME Control Center app.

If PRIME reports that its local helper is unavailable, run:

```bash
npm run agent:mac
```

If that still fails, reinstall the helper with:

```bash
npm run agent:mac:install
```

## Test the setup

Try one of these commands:

- “Prime, explain quantum computing.”
- “Prime, open Google Chrome.”
- “Prime, list displays.”
- “Prime, create a note: call the dentist.”

The Mac must be awake for wake-word listening to work. PRIME can keep the Mac awake while the display sleeps if the wake listener has the required permission.

## Notes on capabilities

PRIME works locally and keeps personal memory in local files under `~/.prime/`:

- `~/.prime/personal-facts.json`
- `~/.prime/assistant-notes.json`

PRIME does not silently read private files, emails, messages, passwords, browser history, or accounts. It does not run arbitrary Terminal commands, delete files, send communications, make purchases, or alter accounts.

## Troubleshooting

### Wake word does not respond

- Confirm PRIME Wake Listener is running
- Confirm Microphone and Speech Recognition access are enabled
- Ensure the Mac is awake and not blocked by sleep restrictions

### Window movement fails

- Grant Accessibility to PRIME Window Manager
- Attach an external display
- Open the target app before moving it

### Conversation unavailable

- Start local Ollama
- Make sure a downloaded model is available

### Agent unavailable

- Run `npm run agent:mac:install`
- Reopen PRIME Control Center

## Related documentation

- [USING.md](./USING.md)
- [README.md](./README.md)
