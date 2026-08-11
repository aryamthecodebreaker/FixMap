# FixMap Report

FixMap found 1 context file and generated 2 test routes.

## Context Files

- `packages/utils/src/currency.ts` (high confidence, score 37): path matches task terms: currency; content matches task terms: round, cent; defines task identifiers: roundToCents; task identifier is defined in maintained implementation source

## Test Routes

- `pnpm --dir packages/utils run test`: nearest package (packages/utils) script named test. Related: `packages/utils/test/currency.test.ts`.
- `pnpm run test`: repository root script named test. Related: `packages/utils/test/currency.test.ts`.

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
