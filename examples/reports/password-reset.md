# FixMap Report

FixMap found 2 context files and generated 2 test routes.

## Context Files

- `src/auth/reset-password.ts` (12): path matches task terms: reset, password; content matches task terms: reset, password; auth-related task signal
- `package.json` (4): content matches task terms: reset, password

## Test Route

- `npm run test`: package script named test; related tests ranked by path overlap. Related: `test/auth/reset-password.test.ts`.
- `npm run typecheck`: package script named typecheck. Related: `src/auth/reset-password.ts`, `package.json`.

## Risk Map

- **high** authentication: authentication-related files are affected

## Changed Files

- None found
