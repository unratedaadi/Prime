# PRIME Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first PRIME Command Center with safe workspace, display, document, clipboard, and personal-assistance foundations.

**Architecture:** The loopback Mac agent validates all commands and delegates fixed native capabilities to focused modules. A small native helper owns display/window actions behind Accessibility permission. The React dashboard visualizes PRIME state and exposes explicit consent and selection controls.

**Tech Stack:** Electron, React 19, Node.js, Swift/AppKit, macOS Accessibility, local Ollama.

**Spec:** `docs/superpowers/specs/2026-11-02-prime-command-center-design.md`

## Global Constraints

- macOS-only and loopback-only privileged agent.
- Local processing by default; no document or clipboard upload.
- No arbitrary shell commands, paths, AppleScript, or account access.
- Confirm all external communications, app quits, calendar writes, file mutations, and destructive actions.
- Every capability must report missing macOS permission clearly.

## Review Focus

- Accessibility unavailable: placement must fail safely without opening, quitting, or moving a different app.
- Duplicate app names/windows: placement must reject ambiguity rather than choose arbitrarily.
- External monitor disconnected: commands must return available displays and not move a window off-screen.
- File searches: only consented fixed roots and bounded results are searched; symlinks and hidden traversal are excluded.
- Clipboard/document content: stays local, has bounded size, and is never written or sent without a new explicit command.

### Task 1: System insight commands

**Files:**
- Create: `agent/mac/system-insight.mjs`, `agent/mac/system-insight.test.mjs`
- Modify: `agent/mac/policy.mjs`, `agent/mac/tools.mjs`, `agent/mac/assistant.mjs`

**Interfaces:**
- Produces `getSystemInsight(kind, dependencies)` where `kind` is `memory` or `storage`.
- Produces commands `system.memory` and `system.storage` with empty payloads.

- [ ] Write failing tests for bounded parsing of `vm_stat`/`df`, and for natural requests “what’s using my memory?” and “how much storage is left?”.
- [ ] Run the focused test and verify it fails because the insight module/commands do not exist.
- [ ] Implement fixed-command diagnostics using `/usr/bin/vm_stat` and `/bin/df`; return structured values only.
- [ ] Run focused tests, then `npm test` and `npm run lint`.

### Task 2: Saved workspace model and safe launch sequence

**Files:**
- Create: `agent/mac/workspaces.mjs`, `agent/mac/workspaces.test.mjs`
- Modify: `agent/mac/assistant.mjs`, `agent/mac/tools.mjs`, `agent/mac/policy.mjs`

**Interfaces:**
- Produces `loadWorkspaces(directory)`, `saveWorkspace(directory, workspace)`, and `runWorkspace(workspace, execute)`.
- Workspace shape: `{name:string, apps:Array<{app:string, profile?:string, display?:string}>}`; maximum 12 apps.

- [ ] Write failing tests for validation, duplicate app rejection, atomic local save, and ordered execution that stops on the first failure.
- [ ] Run the focused test and verify it fails.
- [ ] Implement owner-only workspace storage and command handlers for “open my [name] setup”.
- [ ] Run focused tests, then the full suite and lint.

### Task 3: Display/window helper protocol

**Files:**
- Create: `macos/PrimeWindowManager/PrimeWindowManager.swift`, `macos/PrimeWindowManager/build.mjs`, `agent/mac/window-manager.mjs`, `agent/mac/window-manager.test.mjs`
- Modify: `agent/mac/policy.mjs`, `agent/mac/tools.mjs`, `agent/mac/assistant.mjs`, `package.json`

**Interfaces:**
- Helper accepts fixed JSON over stdin: `{action:'displays'|'move', app?:string, target?:'internal'|'external'}`.
- Produces commands `display.list` and `window.move`.

- [ ] Write failing JS adapter tests for input validation, missing Accessibility permission, no external display, and exact helper invocation.
- [ ] Run focused tests and verify failure.
- [ ] Implement Swift display listing and AX window selection/positioning; return stable JSON codes without window titles/content.
- [ ] Implement the Node adapter and assistant grammar for monitor placement requests.
- [ ] Build the helper and run adapter tests, full tests, lint, and a manual two-display verification.

### Task 4: Command Center theatre mode

**Files:**
- Create: `src/commandCenter.js`, `src/commandCenter.test.js`
- Modify: `src/App.jsx`, `src/App.css`, `desktop/main.mjs`, `desktop/preload.cjs`

**Interfaces:**
- Produces dashboard state `{displayMode:'windowed'|'theatre', selectedDisplayId}` and a fixed `showPrimeOnDisplay(displayId)` desktop bridge.

- [ ] Write failing reducer and bridge-validation tests for theatre state and invalid display IDs.
- [ ] Run focused tests and verify failure.
- [ ] Implement the animated full-screen Command Center view with conversation, task/routine status, and system insight cards.
- [ ] Add the narrow Electron IPC operation for moving PRIME’s own window only.
- [ ] Run frontend tests, production build, desktop packaging checks, and manual external-display verification.

### Task 5: Selected-file search, document text, and clipboard assistance

**Files:**
- Create: `agent/mac/local-documents.mjs`, `agent/mac/local-documents.test.mjs`, `agent/mac/clipboard.mjs`, `agent/mac/clipboard.test.mjs`
- Modify: `agent/mac/policy.mjs`, `agent/mac/tools.mjs`, `agent/mac/assistant.mjs`, `src/App.jsx`

**Interfaces:**
- Produces `findRecentDocuments(query, root, dependencies)` and `readDocumentText(path, dependencies)` with fixed consented roots.
- Produces commands `files.search`, `document.summarize`, `clipboard.transform`; clipboard transforms return text but do not overwrite the clipboard.

- [ ] Write failing tests for fixed-root PDF search, date filtering, symlink rejection, document size limits, and clipboard size limits.
- [ ] Run focused tests and verify failure.
- [ ] Implement read-only search/text extraction with selected file handles from the dashboard; reject unapproved paths.
- [ ] Use local Ollama only for summary/rewrite/translation requests, display result before any copy/write action.
- [ ] Run focused tests, the full suite, lint, and a manual PDF/clipboard test.

### Task 6: Calendar, Reminders, meetings, and communication draft integrations

**Files:**
- Create: `agent/mac/personal-operations.mjs`, `agent/mac/personal-operations.test.mjs`
- Modify: `agent/mac/policy.mjs`, `agent/mac/tools.mjs`, `agent/mac/assistant.mjs`, `src/App.jsx`

**Interfaces:**
- Produces read-only `agenda.today` and `reminders.next`; write proposals `reminder.create`, `calendar.create`, and `communication.draft` require confirmation.

- [ ] Write failing tests for consent gates, redacted audit data, explicit confirmation, and event/reminder bounds.
- [ ] Run focused tests and verify failure.
- [ ] Implement macOS EventKit/Reminders adapter with read-only default and consent-aware UI.
- [ ] Add local audio-file transcription intake only after an explicit selected-file action; return tasks as a draft.
- [ ] Run focused tests, full suite, lint, and manual permission tests.

### Task 7: Proactive monitor opt-in

**Files:**
- Create: `agent/mac/proactive-monitor.mjs`, `agent/mac/proactive-monitor.test.mjs`
- Modify: `agent/mac/server.mjs`, `src/App.jsx`

**Interfaces:**
- Produces `startMonitor(config)` and `stopMonitor()`; configuration names only approved read-only data sources and quiet hours.

- [ ] Write failing tests for disabled-by-default state, quiet hours, unchanged-state silence, and revocation.
- [ ] Run focused tests and verify failure.
- [ ] Implement a local heartbeat that reads only enabled Calendar/Reminders sources and posts only meaningful local notifications.
- [ ] Run focused tests, full suite, lint, and permission/revocation verification.

## Self-review

- System monitoring is Task 1; workspaces and placements are Tasks 2–3; the visible external monitor is Task 4; files/documents/clipboard are Task 5; calendar/reminders/meetings/communications are Task 6; proactive behavior is Task 7.
- All privileged operations use fixed commands and consent gates. The highest-risk unavailable-permission, duplicate-app, disconnected-display, file-root, and content-boundary cases are assigned tests above.
