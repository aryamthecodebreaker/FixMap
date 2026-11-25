# Real-world feature bench 2: pre-registration

Written and committed **before** any change to the features it judges and before it is run.
The first bench (`PREREGISTRATION.md`, results in `results.json`) stays as recorded: all four
features missed their bars there, and those 40 cases are development cases from now on.

## Why a second bench

The first bench's failures were worked on afterwards:

- **Verify narration**: the one failing case (a long design record pasted into one sentence)
  was fixed in 0.9.9.
- **Historical plans**: plans at an older commit now read files and history like a checkout
  (0.9.10); a labelled re-check on the same 40 cases gave 40 of 40.
- **Change scope** and **reviewer suggestions**: 0.9.16 changes them, tuned only on the first
  bench's 40 cases.

A fix checked on the cases that motivated it proves little, so all four are judged again on
cases they have never been measured on.

## Cases

The 133 cases already frozen in `benchmarks/polyglot-heldout-2/dataset.json` (28) and
`benchmarks/polyglot-heldout-3/dataset.json` (105): real issues fixed by merged pull requests
in public Python, Java, Go, Rust, Ruby, PHP and C# repositories that no FixMap feature has
been measured on. They were frozen for ranking tests by mechanical rules committed before
those runs; none is added, removed or edited for this bench. A case whose pull request or
history cannot be fetched is reported as `unavailable` and counts against no bar.

## Features and bars

The four bars of `PREREGISTRATION.md` (including its 2026-11-24 addendum), unchanged:

1. **Verify and its narration**: every available case passes.
2. **Change scope**: FixMap's mean recall of the pull request's other changed source files is
   strictly higher than the same-directory baseline's, on cases changing at least two source files.
3. **Reviewer suggestions**: FixMap's top-three hit rate on pull request authors is strictly
   higher than the three-most-frequent-committers baseline's, excluding cases where no author
   appears in the 400-commit history.
4. **Historical plans**: identical top-five ranked files in every available case.

A feature that meets its bar may leave preview. A feature that misses keeps its label, and
the result is published as measured.

## How it runs

`node scripts/evaluate-features.mjs --bench feature-bench-2 --discard-checkouts` writes
`benchmarks/feature-bench/results-2.json`. It runs once, on Linux (GitHub Actions workflow
`heldout-eval.yml`, branch `eval/feature-bench-2`), because one repository in
`polyglot-heldout-3` cannot be checked out on Windows. `--discard-checkouts` only deletes each
clone after its case is scored.

This bench uses public GitHub data during development only. It adds no network, API, account,
or upload behavior to the FixMap product.
