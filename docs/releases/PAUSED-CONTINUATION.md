# FixMap continuation status

The September 2026 pause ended on 2026-11-22, when Aryam resumed the project and
asked for small public releases (0.9.x) until v0.10.0 contains the full ledger scope.

- The checkpoint left uncommitted at the pause was verified (typecheck, lint, tests,
  Action bundle) and committed.
- Release approach (decided 2026-11-22): ship the v0.10 work in 0.9.x releases, with
  unfinished commands, options, and MCP tools labelled "preview". Each later 0.9.x
  removes the label from what it completes.
- Authoritative scope remains `docs/releases/v0.10.0-implementation-ledger.md`.
