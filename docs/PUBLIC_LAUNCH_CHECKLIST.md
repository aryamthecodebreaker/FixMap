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

## v0.2 launch

- [x] Create a `v0.1.0` tag after the public Action path is tested from another repository.
- [x] Add an interactive demo and README screenshot.
- [x] Add a checked-in ranking evaluation gate with transparent cases and output.
- [x] Confirm the GitHub Action can comment on a PR in a separate acceptance repository.
- [x] Publish `@aryam/fixmap` and `@aryam/fixmap-core` for the v0.2.1 patch release.
- [x] Create and test the `v0.2.0` release tag from protected `main`.
- [x] Create `v0.2.1` from green protected `main` and verify the public `npx` install.
- [x] Expand evaluation to non-trivial external repositories before claiming broad accuracy — see [`benchmarks/external/`](../benchmarks/external/README.md) (6 pinned real-issue cases; honest top-1/3/5 hit rates published).

## Action fork-permission acceptance (issue #16)

Validated 2026-07-15 in the private acceptance repository `FixMap-Action-Acceptance`, [run 29392400169](https://github.com/aryamthecodebreaker/FixMap-Action-Acceptance/actions/runs/29392400169), with the Action pinned to `main` commit `10f8027c9eae9672fa6d084e6c61092f58df6180` (the read-only degradation fix, #46):

- [x] Workflow granted only `contents: read` — the same `GITHUB_TOKEN` scope GitHub applies to workflows triggered by forked pull requests, so this exercises the exact fork failure mode without needing a second account.
- [x] Job conclusion **success** (green), not a red X: the comment upsert received `403 Resource not accessible by integration` and the Action degraded gracefully.
- [x] Warning annotation emitted, naming the cause and pointing at the step summary.
- [x] Full report present in the job log and step summary; `0` comments created on the PR.
- [x] Comment write path (default write permissions) was already validated in this repository during the v0.2 acceptance round.
- [x] README documents safe options for fork PRs and explicitly warns against `pull_request_target` with untrusted checkout.
- [x] Root `action.yml` carries Marketplace `branding` metadata (map icon, green) and points at the checked-in Action bundle.

Remaining before a Marketplace listing (owner action): accept the Marketplace Developer Agreement if needed, then publish the Action from the release UI. This legal agreement must be accepted by the repository owner; it is not automated by the release workflow.

## Launch Copy

- [x] Lead with the pain: AI coding agents waste time when they read the wrong files or skip the right tests.
- [x] Promise the narrow result: FixMap maps a prompt or diff to context files, tests, and risk notes.
- [x] Be honest about scope: deterministic MVP first, trainable ranking later.
