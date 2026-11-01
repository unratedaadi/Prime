# PRIME — Mac-only master build prompt

Build and maintain **PRIME**, a polished, local-first personal voice control center for **one macOS computer only**. It must understand spoken and typed requests, hold useful local conversations, and carry out transparent, approved actions on that same Mac.

## Scope guard

- Build only for macOS. Keep the product focused on this Mac and its local processes.
- Keep the system local-first: the main app should not require any cloud service for core behavior.
- Do not expose a network server beyond the local loopback Mac agent. The app must not become a remote shell, device-management tool, credential manager, or remote workstation.
- Keep all default data local to this Mac. Any cloud speech or AI providers must be opt-in, clearly disclosed, isolated behind an interface, and never required for the main app.
- Follow the setup and usage guidance in [setup.md](./setup.md) and [USING.md](./USING.md). Keep those docs accurate as implementation changes.

## Product personality

PRIME is calm, concise, intelligent, and reassuring. It must not imitate a copyrighted fictional character. Prefer short confirmations such as “Opening, boss.” and “Done, boss.” Give one greeting only after a long idle period—not every wake word. Understand English, Hindi, and Hinglish where macOS speech recognition supports them.

## Architecture

- Use React for the dashboard and Electron for the Mac application shell.
- Keep the native macOS wake listener in Swift and use on-device recognition where available.
- Keep a narrow local Mac agent bound to `127.0.0.1`; authenticate every agent command and keep its key outside the renderer.
- Separate modules by responsibility: audio capture, wake-word service, speech-to-text service, deterministic intent parser, confirmation service, action executor, integration adapters, text-to-speech, local command history, settings/privacy, and automations.
- Keep action execution behind a strict allowlist. Never evaluate arbitrary shell commands, AppleScript supplied by speech, raw paths, arbitrary URLs, or dynamically downloaded code.
- Use mocks or safe local implementations for integrations so the primary experience works without API keys.
- Keep default personal memory and notes local in `~/.prime/` and never silently read private data from unrelated files, emails, messages, browser history, or accounts.

## Dashboard — the first and primary screen

Create a polished, keyboard-accessible desktop dashboard with a deliberate control-room visual identity. Keep the existing restrained local-control-center aesthetic: readable type, warm neutral surfaces, dark navigation, focused accent color, subtle motion only where it clarifies listening/processing, strong focus states, and reduced-motion support.

The dashboard must include:

1. **Voice console** — large push-to-talk microphone button; Idle/Listening/Processing/Speaking/Needs confirmation/Error state; animated waveform; live transcript; detected command; intended action; cancel control; recent voice activity; push-to-talk shortcut; microphone test; native wake-listener status.
2. **Safe Mac command bar and quick actions** — typed command entry, examples, and supported local actions for Finder, Notes, Spotify, Google search, and YouTube search.
3. **Local tools** — timers and local notes, clearly labelled as local.
4. **Command history** — timestamp, transcript, normalized intent, target, result, error detail, confirmation text, search, date/status/type filters, replay, copy, delete history, and confirmed “delete all local data”.
5. **Automations** — create, edit, enable/disable, duplicate, delete, and run local routines; show trigger, ordered actions, confirmation-required steps, and execution log. Example: “Start focus mode” may open Spotify and pause before changing Do Not Disturb.
6. **Permissions & safety** — clearly separate safe, confirmation-required, and blocked actions. Per-integration consent controls for Mac microphone, notifications, Calendar, Mail, and Accessibility must say macOS still controls the actual permission.
7. **Settings** — microphone selector, audio test, wake phrase `Hey Prime` / `Prime`, wake-word toggle, push-to-talk shortcut, English/Hindi/Hinglish preference, speech-to-text provider, text-to-speech voice/rate/volume, local transcript storage, auto-delete retention, cloud-processing disclosure, and appearance preference.

## Voice interaction flow

1. User says `Hey Prime` / `Prime`, presses push-to-talk, or types a command.
2. PRIME displays listening state and live transcript.
3. PRIME normalizes input to a structured intent with confidence and risk level.
4. PRIME displays what it understood and exactly what it will do.
5. Safe allowlisted actions run immediately with a concise visual/spoken response.
6. Sensitive actions show a confirmation card and request a clear yes/no. Pending confirmation expires after 30 seconds.
7. PRIME records privacy-safe metadata locally only if history is enabled.

## Implemented command families

Keep deterministic Mac-only handling accurate to the implementation. The product must support the currently documented command families and never imply capabilities that are not implemented or reviewed.

Current supported families:

- Conversation and memory: local conversation, personal memory recall/save, and local note memory
- App control: open and quit installed apps, list installed apps, launch built-in work setup/coding setup, and handle Chrome profile selection where supported
- Search: explicit Google and YouTube search
- Media: Spotify/Music controls, volume, play/pause, and app-specific media operations
- Notes and timers: local notes creation and reading; local timers
- System status: time, battery, memory, storage, and display listing
- Display/window management: list displays, move an app to the internal or external display when Accessibility is available
- WhatsApp: confirmation-gated contact calls when uniquely matched and approved by the system

Do not document Calendar, Reminders, notification reading, arbitrary files, screen reading, messages, purchases, browser-history inspection, account manipulation, or system-setting control as available until a reviewed adapter is implemented.

## Planned Command Center work

The external-display theatre view, custom workspace editor, selected-file/PDF intelligence, clipboard assistance, Calendar/Reminders, meeting summarization, communication drafts, and opt-in proactive monitoring are planned. Their scope and privacy constraints are defined in `docs/superpowers/specs/2026-11-02-prime-command-center-design.md` and the current usage docs.

## Intent contract

```ts
{
  id: string,
  rawTranscript: string,
  normalizedText: string,
  category: 'app' | 'search' | 'media' | 'timer' | 'calendar' | 'weather' | 'notes' | 'system' | 'automation',
  action: string,
  parameters: Record<string, unknown>,
  riskLevel: 'safe' | 'confirm' | 'blocked',
  confidence: number
}
```

## Non-negotiable safety rules

- Allowlist every executable action and validate all parameters.
- Never run arbitrary Terminal/shell commands, arbitrary AppleScript, arbitrary file deletion, raw file-path access, unapproved purchases, messages, emails, posts, payments, account changes, or data sharing.
- Require explicit confirmation for communications, macOS/system setting changes, calendar changes, deletion, or access to sensitive data.
- Show the full intended action before confirmation and make cancellation obvious.
- Store transcripts locally by default. Do not log microphone audio, passwords, authentication tokens, or personal content by default.
- Respect the user’s local privacy boundary: no silent reading of private files, emails, messages, browser history, accounts, or password material.

## Setup and documentation requirements

- Keep onboarding and installation documentation accurate for a fresh macOS setup.
- Include setup instructions for the local agent, wake listener, and helper components, and make the installation flow easy to follow.
- Maintain accurate docs in [README.md](./README.md), [USING.md](./USING.md), and [setup.md](./setup.md).
- Document permission requirements clearly: Microphone and Speech Recognition for the wake listener, Accessibility for display window movement, and any additional app-specific permissions for WhatsApp or automation features.

## Quality bar and deliverables

- Keep source code modular and tested.
- Test intent parsing, risk classification, confirmation timeout, action allowlisting, local persistence, and native wake parsing.
- Preserve onboarding and clear local privacy explanations.
- Keep setup, development, test, build, native installation, and troubleshooting documentation accurate.
- Verify with `npm test`, `npm run lint`, `npm run build`, and native Swift tests before claiming completion.
- Package only `PRIME Control Center.app` and `PRIME Wake Listener.app` for this Mac.
- Keep all default behaviors local and safe by design; cloud features remain opt-in and clearly disclosed.
