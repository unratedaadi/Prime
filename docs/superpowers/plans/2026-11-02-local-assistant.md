# PRIME local assistant implementation plan

Goal: a usable Mac voice assistant with reliable wake gating, natural conversation on Ollama, expanded local actions, and explicit internet searches.

Architecture: native Swift on-device transcription sends authenticated requests to one loopback Node agent. Deterministic commands execute reviewed tools. Local Ollama handles conversation and may propose structured supported actions; inferred actions require a short-lived confirmation. The renderer never receives credentials.

- Add assistant parser, local conversation client, bounded notes/timers, confirmation expiry and regression tests.
- Expand reviewed Mac tools for installed application names, media, volume, time and battery with strict parameter validation.
- Wire dashboard, Electron preload and native final-transcript wake session to the same assistant endpoint.
- Verify Node suite, lint, frontend build, native Swift tests and local model response. Build and install updated app components if sandbox permits.

Constraints: no cloud model requests; no arbitrary shell, speech-supplied scripts, file deletion or account communications. Internet searches only on explicit commands. macOS permissions remain OS controlled. Private notes stay in the user's .prime directory. Timer state lasts for the agent session. Unsupported capabilities must be identified honestly.

Review focus: partial speech never executes; model output never bypasses policy; confirmation is single-use and expires; notes never leave localhost; disconnected or missing-model state remains actionable.
