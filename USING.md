# Using PRIME

PRIME is a local-first macOS assistant. Speak a command after **“Prime”** or **“Hey Prime”**, or type the same command into PRIME Control Center. The Mac must be awake; PRIME can keep the Mac awake while its display sleeps after the wake listener has permission.

## First-time setup

1. Install the agent, wake listener, dashboard, and window helper:

   ```bash
   npm run agent:mac:install
   npm run wake:mac:build
   npm run wake:mac:install
   npm run window-manager:mac:build
   npm run desktop:install
   ```

2. In **System Settings → Privacy & Security**, enable **Microphone** and **Speech Recognition** for PRIME Wake Listener. Enable **Accessibility** for PRIME Window Manager to move apps between displays. macOS may request Contacts/Automation/Accessibility permission for WhatsApp controls.

3. Open **PRIME Control Center**. If PRIME reports that its local helper is unavailable, run `npm run agent:mac` or reinstall it with the first command above.

## Commands

### Conversation and memory

- “Prime, explain quantum computing.”
- “Prime, remember that I prefer concise answers.”
- “Prime, what do you know about me?”
- “Prime, forget everything you know about me.”

Conversation uses a downloaded local Ollama model. It is helpful, not authoritative; verify important or current information.

### Apps, browser, and workspaces

- “Prime, open Google Chrome.”
- “Prime, quit Spotify.” → say **“Prime, yes”** to confirm.
- “Prime, list installed apps.”
- “Prime, list Chrome profiles.”
- “Prime, switch to Chrome profile Work.”
- “Prime, open my work setup.” / “Prime, open my coding setup.”

The built-in work/coding setup opens **Visual Studio Code**, **Google Chrome**, then **Notes**. It stops on the first failed app and reports what opened.

### Displays, system, and media

- “Prime, list displays.”
- “Prime, move Chrome to the external monitor.”
- “Prime, put Notes on my MacBook.”
- “Prime, what is using my memory?”
- “Prime, how much storage is left?”
- “Prime, set volume to 30.” / “Prime, pause music on Spotify.”

Window movement requires an attached external display, a running target app, and Accessibility permission. Searches open in the default browser; PRIME does not read search-result pages yet.

### Notes, timers, and calls

- “Prime, create a note: call the dentist.”
- “Prime, read my notes.”
- “Prime, set a timer for 50 minutes.”
- “Prime, call a contact on WhatsApp.” → say **“Prime, yes”** to confirm.

WhatsApp calls require one unique Contact match, WhatsApp installed, and macOS permission. PRIME refuses ambiguous contacts.

## Privacy and confirmations

PRIME asks for a fresh confirmation before a WhatsApp call or app quit; it expires after 30 seconds. Say **“Prime, cancel”** to stop a pending action.

PRIME does not silently read private files, emails, messages, passwords, browser history, or accounts. It does not run arbitrary Terminal commands, delete files, send communications, make purchases, or alter accounts.

Personal facts you explicitly save live locally in `~/.prime/personal-facts.json`; assistant notes are in `~/.prime/assistant-notes.json`.

## Planned, not available yet

The external-display PRIME theatre view, custom workspace editor/layouts, selected-file/PDF tools, clipboard rewriting/translation, Calendar/Reminders, meeting tools, communication drafts, and proactive monitoring are planned—not active commands. See the [design](docs/superpowers/specs/2026-11-02-prime-command-center-design.md) and [implementation plan](docs/superpowers/plans/2026-11-02-prime-command-center.md).

## Troubleshooting

- Wake word does not respond: confirm PRIME Wake Listener is running and has Microphone + Speech Recognition access.
- Window movement fails: grant Accessibility to PRIME Window Manager, attach the external display, and open the target app first.
- Conversation unavailable: start local Ollama with a downloaded model.
- Agent unavailable: run `npm run agent:mac:install` and reopen PRIME Control Center.
