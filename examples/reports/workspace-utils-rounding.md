# FixMap Report

FixMap found 2 context files and generated 3 test routes.

## Context Files

- `packages/utils/src/currency.ts` (medium confidence, score 13): path matches task terms: currency; content matches task terms: round, cent; defines task identifiers: roundToCents
- `README.md` (low confidence, score 6): content matches task terms: round, cent, keep, fraction, formatt, currency

## Test Route

- `pnpm --dir packages/utils run test`: nearest package (packages/utils) script named test. Related: `packages/utils/test/currency.test.ts`.
- `pnpm --dir packages/utils run typecheck`: nearest package (packages/utils) script named typecheck. Related: `packages/utils/src/currency.ts`.
- `pnpm run test`: repository root script named test. Related: `packages/utils/test/currency.test.ts`.

## Risk Map

- None found

## Changed Files

- None found

## Diagnostics

- None found
