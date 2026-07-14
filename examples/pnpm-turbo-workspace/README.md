# pnpm + Turborepo Workspace Example

A minimal pnpm workspace with Turborepo task wiring, used to prove workspace-aware script routing on a realistic monorepo shape:

```text
apps/api            @example/api    (test, typecheck scripts)
packages/utils      @example/utils  (test, typecheck scripts)
package.json        root turbo run test / typecheck
```

`apps/api` depends on `@example/utils`, and both packages own separate `test` and `typecheck` scripts, so the right routing answer changes with the task.

## Tasks and expected routing

From the repository root:

```bash
npm install
npm run build
node packages/cli/dist/cli.js plan --issue "roundToCents keeps fractions of a cent when formatting currency" --repo examples/pnpm-turbo-workspace
```

- Context should rank `packages/utils/src/currency.ts`.
- The first test route should be `pnpm --dir packages/utils run test` — the nearest package, not the root `turbo run test`.

```bash
node packages/cli/dist/cli.js plan --issue "orderTotal ignores unknown discountCode values" --repo examples/pnpm-turbo-workspace
```

- Context should rank `apps/api/src/orders.ts` first.
- The first test route should switch to `pnpm --dir apps/api run test`.

The full generated reports are checked in under [`../reports/`](../reports) (outside this example so the reports never feed back into their own scan):

- [`../reports/workspace-utils-rounding.md`](../reports/workspace-utils-rounding.md)
- [`../reports/workspace-api-discount.md`](../reports/workspace-api-discount.md)

## CI guard

`npm run smoke` runs [`scripts/smoke-workspace.mjs`](../../scripts/smoke-workspace.mjs), which asserts the nearest-package routing for both tasks and fails if the checked-in reports drift from generated output. After an intentional ranking change, refresh them with:

```bash
node scripts/smoke-workspace.mjs --update
```
