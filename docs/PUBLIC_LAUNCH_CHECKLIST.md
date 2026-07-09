# Public Launch Checklist

Use this before announcing FixMap anywhere beyond a quiet soft launch.

## Repository

- [x] README explains the problem, audience, CLI, Action, and current MVP status.
- [x] MIT license is present.
- [x] CI badge is visible.
- [x] `npm run ci` runs typecheck, tests, build, action bundle drift check, and smoke checks.
- [x] Example input and sample output are included.
- [x] Repository visibility is public.
- [x] Repository topics are set: `ai-coding`, `developer-tools`, `github-actions`, `code-review`, `testing`, `repo-intelligence`.
- [x] `main` requires the `test` status check, blocks force-pushes and deletions, and requires resolved conversations.

## First Release

- [ ] Create a `v0.1.0` tag after the public Action path is tested from another repository.
- [ ] Add one short screen recording or GIF showing CLI output.
- [ ] Add one real-world example from a non-trivial repository.
- [x] Confirm the GitHub Action can comment on a PR in a separate acceptance repository.

## Launch Copy

- [ ] Lead with the pain: AI coding agents waste time when they read the wrong files or skip the right tests.
- [ ] Promise the narrow result: FixMap maps a prompt or diff to context files, tests, and risk notes.
- [ ] Be honest about scope: deterministic MVP first, trainable ranking later.
