# FixMap Report

FixMap found 2 context files and generated 3 test routes.

## Context Files

- `apps/api/src/orders.ts` (high confidence, score 41): path matches task terms: order; content matches task terms: discount, order, total, code; defines task identifiers: orderTotal; task identifier is defined in maintained implementation source
- `packages/utils/src/currency.ts` (medium confidence, score 14): content matches task terms: discount, total; defines symbols matching task terms: applyDiscount, discounted

## Test Routes

- `pnpm --dir apps/api run test`: nearest package (apps/api) script named test. Related: `apps/api/test/orders.test.ts`.
- `pnpm --dir packages/utils run test`: nearest package (packages/utils) script named test. Related: `packages/utils/test/currency.test.ts`.
- `pnpm run test`: repository root script named test. Related: `apps/api/test/orders.test.ts`, `packages/utils/test/currency.test.ts`.

## Risk Map

- **low** public-api: ranked files touch public-api; review this area before editing, but no diff evidence is available yet

## Changed Files

- None found

## Analysis

- Task grounding: **anchored**
- Repository scan: **complete**
- Ranking shape: **separated**
- Next action: Inspect apps/api/src/orders.ts and its routed tests before editing.

## Diagnostics

- None found
