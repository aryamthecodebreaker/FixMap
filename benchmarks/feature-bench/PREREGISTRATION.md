# Real-world feature bench: pre-registration

Written and committed **before** the bench was run. The commit that adds this file precedes the
commit that adds any result, so the bars below cannot have been chosen to fit the numbers.

## Cases

The 40 held-out cases already frozen in `benchmarks/heldout/dataset.json` (12) and
`benchmarks/polyglot-heldout/dataset.json` (28): real issues fixed by real merged pull requests
in public repositories, across TypeScript/JavaScript, Python, Java, Go, Rust, Ruby, PHP and .NET.
FixMap's ranking was never tuned on them. Each case pins the commit before the fix (`sha`) and
the pull request (`pullRequest`). The bench fetches `pull/<n>/head` from GitHub and compares
against the merge base of that head and `sha`. No case is added, removed or edited after this
file is committed; a case whose pull request can no longer be fetched is reported as
`unavailable` and counts against no bar.

## Features and bars

Each bar is a pass/fail decision fixed here. A feature that misses its bar keeps its preview
label in v0.10.0 (decision of 2026-11-24); the bench is never tuned until it passes.

1. **Verify and its narration** (correctness property, absolute bar).
   Plan the issue text at `sha`, then Verify the pull request's diff (merge base to head).
   A case passes when Verify lists every file the pull request changed and
   `checkVerifyNarrative` reports no problem. **Bar: every available case passes.**

2. **Change scope** (relative bar against a simple baseline).
   Cases whose pull request changes at least two source files. Anchor: the changed source file
   with the most changed lines (ties by path). Let k be the size of FixMap's affected set, capped
   at 20. Baseline: the anchor's same-directory source files, sorted by path, first k. Metric:
   recall of the pull request's other changed source files, per case, averaged.
   **Bar: FixMap's mean recall is strictly higher than the baseline's.**

3. **Reviewer suggestions** (relative bar against a simple baseline).
   History: the 400 commits before `sha`. Suggestions for the pull request's changed files from
   `routeReviewers` (CODEOWNERS, annotations, policy, history). A case hits when one of the top
   three suggestions matches an author of the pull request's commits (case-insensitive name).
   Baseline: the three most frequent commit authors in the same 400 commits. Cases where no
   pull request author appears anywhere in that history are excluded from both (nobody could
   suggest them) and counted. **Bar: FixMap's hit rate is strictly higher than the baseline's.**

4. **Historical plans** (consistency property, absolute bar).
   From a checkout of the pull request head, run Plan with `--at <sha>`; compare with Plan run
   on a checkout of `sha`. **Bar: identical top-5 ranked files in every available case.**

## Not judged by this bench

These need hand-labelled answers or inputs that merged pull requests do not provide, so they
stay previews unless a later, separately pre-registered evaluation covers them: Contract
Guardian, sensitive-data flows, supply-chain evidence, architecture policy and drift, agent
conflict detection, migration planning, plan alternatives, outcome learning, change dossiers,
product capabilities, cross-repository workspaces.
