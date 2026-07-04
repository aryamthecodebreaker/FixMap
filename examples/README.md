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
