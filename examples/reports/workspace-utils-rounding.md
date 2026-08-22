# FixMap Report

FixMap found 1 context file, 1 impact file, and generated 2 test routes.

## Context Files

- `packages/utils/src/currency.ts` (high confidence, score 37): path matches task terms: currency; content matches task terms: round, cent; defines task identifiers: roundToCents; task identifier is defined in maintained implementation source; BM25 whole-file candidate #1; BM25 symbol candidate #1: roundToCents

## Impact Graph

- `packages/utils/test/currency.test.ts` (high confidence, impact 13): this file imports packages/utils/src/currency.ts; routed test for packages/utils/src/currency.ts via pnpm --dir packages/utils run test

Inspection order: `packages/utils/src/currency.ts` → `packages/utils/test/currency.test.ts`.
History evidence: 93 eligible commits.

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
