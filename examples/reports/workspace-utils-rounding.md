# FixMap Report

FixMap found 1 context file and generated 3 test routes.

## Context Files

- `packages/utils/src/currency.ts` (high confidence, score 33): path matches task terms: currency; content matches task terms: round, cent; defines task identifiers: roundToCents

## Test Routes

- `pnpm --dir packages/utils run test`: nearest package (packages/utils) script named test. Related: `packages/utils/test/currency.test.ts`.
- `pnpm run test`: repository root script named test. Related: `packages/utils/test/currency.test.ts`.
- `pnpm --dir packages/utils run typecheck`: nearest package (packages/utils) script named typecheck. Related: `packages/utils/src/currency.ts`.

## Risk Map

- None found

## Changed Files

- None found

## Analysis

- Task grounding: **anchored**
- Repository scan: **complete**
- Ranking shape: **separated**
- Next action: Inspect packages/utils/src/currency.ts and its routed tests before editing.

## Diagnostics

- None found
