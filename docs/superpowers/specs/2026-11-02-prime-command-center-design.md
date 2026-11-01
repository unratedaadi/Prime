# PRIME Command Center Design

## Intent

Turn PRIME into a local-first macOS personal assistant that feels conversational and capable on one or two displays. It should answer naturally with a dry, supportive tone; operate only through explicit voice or typed commands by default; and offer separate opt-in integrations for personal data.

## Goals

- Provide a full-screen external-display Command Center with PRIME’s animated core, active conversation, next tasks, current routine, and system health.
- Add reliable local commands for system insight, clipboard help, document discovery/summaries, and saved workspaces.
- Add multi-display app placement and workspace launch through the macOS Accessibility API, after the user grants that permission.
- Keep personal facts, document content, and command history local. Confirm calls, messages, calendar writes, file moves/renames, application quits, and any other consequential action.
- Let the user enable Calendar, Reminders, notifications, Contacts, selected folders, and communications separately.

## Non-goals

- Silent collection of files, messages, passwords, browser history, or account contents.
- Shell execution, arbitrary AppleScript, arbitrary file deletion, or unattended message sending.
- Promising exact window placement where macOS Accessibility permission or an app’s window model prevents it.

## Architecture

The loopback Mac agent remains the only process that performs privileged actions. A new local capability layer provides bounded system diagnostics, clipboard transformation, selected-file metadata/search, safe document text extraction, and named workspace definitions. A native macOS helper will own display/window enumeration and positioning because Electron browser code cannot safely control other applications. The React dashboard gains a theatre-friendly Command Center mode that can be moved to a selected display.

## User experience

- “Show PRIME on the big screen” opens Command Center fullscreen on the selected external display.
- “Move Chrome to the external monitor” and “Put Notes on my MacBook” request a named app placement. PRIME reports a clear permission error if Accessibility is not granted.
- “Open my work setup” runs a saved workspace: opens apps, optionally chooses Chrome profiles, then applies the saved placements. Each workspace is validated before execution; failed steps stop and report the actual state.
- “What’s using my memory?” and “How much storage is left?” return local system measurements.
- “Find the PDF I downloaded yesterday” searches only the Downloads folder, returns a bounded list, and never uploads content. Document summaries require the user to name a result or choose a local file through the dashboard.
- “Rewrite what I copied” and “Translate this into Hindi” use the local model on the current clipboard after explicit clipboard-read consent.

## Privacy and permission model

Capabilities are disabled until their associated macOS permission or selected directory consent exists. PRIME will explain what it needs, why, and how to revoke it. Read-only requests are visible in the dashboard activity log. Communications and state-changing operations always receive an immediate one-time confirmation.

## Delivery order

1. Command Center display, system diagnostics, and workspace data model.
2. Native display/window helper and safe placement commands.
3. Selected-folder search, PDF/text extraction, clipboard transformations.
4. Calendar/Reminders read access and confirmation-gated writes.
5. Meeting, recording, message-draft, and proactive monitoring integrations after their individual consent flows are implemented.
