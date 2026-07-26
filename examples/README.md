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

## When FixMap declines to answer

Publishing only successful routings would suggest FixMap always returns a confident ranking. It does not, and the reports where it steps back are the ones worth reading before you trust it on your own repository:

| Report | Task | What FixMap does |
| --- | --- | --- |
| [`reports/declines-fabricated-identifier.md`](reports/declines-fabricated-identifier.md) | Names symbols that do not exist | Names the unresolved identifiers, discards their component words, returns no files |
| [`reports/declines-vague-task.md`](reports/declines-vague-task.md) | "clean this up and make the general performance better overall" | Grounds the task as vague and asks for a concrete anchor |
| [`reports/declines-unmatched-terms.md`](reports/declines-unmatched-terms.md) | Behavior this repository does not contain | Lists the exact terms it searched for and reports no match |

In each case the report says which of the two ends is at fault — the task or the repository — rather than returning a plausible file. The [adversarial suite](../benchmarks/adversarial) asserts this behavior against real repositories at every change.

Regenerate them from live output with:

```bash
npm run render:examples
```
