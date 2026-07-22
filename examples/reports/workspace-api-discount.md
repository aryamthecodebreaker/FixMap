# FixMap Report

FixMap found 3 context files and generated 3 test routes.

## Context Files

- `apps/api/src/orders.ts` (high confidence, score 17): path matches task terms: order; content matches task terms: discount, order, total, code; defines task identifiers: orderTotal
- `README.md` (medium confidence, score 8): content matches task terms: order, total, ignore, unknown, discount, code, value
- `packages/utils/src/currency.ts` (low confidence, score 6): content matches task terms: discount, total

## Test Route

- `pnpm --dir apps/api run test`: nearest package (apps/api) script named test. Related: `apps/api/test/orders.test.ts`, `packages/utils/test/currency.test.ts`.
- `pnpm --dir packages/utils run test`: nearest package (packages/utils) script named test. Related: `apps/api/test/orders.test.ts`, `packages/utils/test/currency.test.ts`.
- `pnpm --dir apps/api run typecheck`: nearest package (apps/api) script named typecheck. Related: `apps/api/src/orders.ts`, `packages/utils/src/currency.ts`.

## Risk Map

- **medium** public-api: public interfaces or request handling may change

## Changed Files

- None found

## Diagnostics

- None found
