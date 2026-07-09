# Contributing to FixMap

Thanks for helping make AI-assisted development more grounded and reviewable.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Keep proposals focused on repository context, test routing, risk signals, or the GitHub Action workflow.
- For a bug, include a small reproducible repository shape or command when possible.

## Local Setup

FixMap uses Node.js 20.11 or newer and npm workspaces.

```bash
npm ci
npm run ci
```

The CI command type-checks every workspace, runs tests, builds the CLI, Action, and web app, checks generated Action bundle drift, and runs smoke checks.

## Making a Change

1. Open an issue first for substantial features or behavior changes.
2. Create a focused branch from `main`.
3. Add or update tests with the behavior you change.
4. Run `npm run ci` before opening a pull request.
5. Explain the user impact and verification in the pull request description.

`main` is protected. Pull requests must pass the required CI check and resolve conversations before merge.

## Generated Action Bundle

The GitHub Action runs from `packages/action/dist/index.mjs`. When changing Action source, run:

```bash
npm run build:action
```

Commit the regenerated bundle with the source change. CI rejects bundle drift.

## Scope and Style

- Prefer deterministic, inspectable signals over opaque scoring.
- Keep reports honest about what FixMap suggests versus what it proves.
- Avoid adding network services or API keys to the local-first core without a focused proposal.
- Keep pull requests narrow enough to review confidently.

## Reporting Bugs and Requesting Features

Use the repository's issue forms for bugs and feature ideas. For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
