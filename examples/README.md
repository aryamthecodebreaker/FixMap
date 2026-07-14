# FixMap Examples

These examples are intentionally small so you can inspect the full input and output in a minute.

## Tiny Auth App

`tiny-auth-app` is a minimal TypeScript project with a password reset function and a matching test file. It is useful for checking FixMap's path, content, and nearby-test ranking.

From the repository root:

```bash
npm install
npm run build
node packages/cli/dist/cli.js plan --issue "password reset emails fail" --repo examples/tiny-auth-app
```

Expected shape:

- `src/auth/reset-password.ts` should rank as a context file.
- `test/auth/reset-password.test.ts` should appear as a related test.
- The report should include an authentication risk note.

See `reports/password-reset.md` for a sample report.

## pnpm + Turborepo Workspace

`pnpm-turbo-workspace` is a two-package pnpm monorepo with Turborepo task wiring. It proves that test routing picks the nearest package script (`pnpm --dir packages/utils run test` or `pnpm --dir apps/api run test`) depending on the task, instead of always suggesting the root `turbo run test`.

The input tasks and full expected reports are checked in; `npm run smoke` asserts the routing and fails on report drift. See [`pnpm-turbo-workspace/README.md`](pnpm-turbo-workspace/README.md).
