# archive/

Historical, superseded, or non-active material moved out of the active project
structure during the repository audit. Nothing here is referenced by application
code, build tooling, CI, or deployment configuration. Nothing here has been
deleted — Git history is preserved via `git mv` renames.

## Layout

- `reports/` — point-in-time engineering handoff/audit reports. Read-only history.
- `notes/` — planning notes and external-AI context handshakes that are no
  longer maintained against the live codebase.

## Contents

| File | Moved from | Why archived |
|---|---|---|
| `reports/updated-till-now.md` | `updated-till-now.md` (repo root) | Full handoff written against an older commit baseline (states `main`/`canary` at `3c3b402`; both have since advanced). Superseded by `ARCH_AUDIT_REPORT.md` (local-only, not committed). Kept for its debugging-history narrative. |
| `notes/AI_PROJECT_CONTEXT.txt` | `AI_PROJECT_CONTEXT.txt` (repo root) | Context handshake for external AI tools. Contains machine-specific absolute paths (`O:\…`) and a stale runtime model (describes in-memory-only sessions; backend now supports Redis). Superseded by `README.md` + `ARCH_AUDIT_REPORT.md`. |

## Rules

- Do not import, fetch, or link to files in `archive/` from active code.
- Do not revive an archived doc by editing it in place; write a new active doc
  and reference the archived one for history.
- Removal of anything under `archive/` requires explicit maintainer approval
  (the audit policy is cleanup without irreversible loss).
