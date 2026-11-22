# Polyglot held-out cohort

This cohort decides whether FixMap's Python, Java, Go, Rust, Ruby, PHP, and .NET support
leaves preview. It uses repositories that no earlier FixMap cohort has touched, and it is
measured once.

## Order of operations

1. `repositories.json` fixes the candidate repositories and their order (rule below).
2. `node scripts/freeze-polyglot-cohort.mjs --suite polyglot-heldout --record` freezes the
   cases from GitHub metadata only. FixMap is not run.
3. The frozen `dataset.json` and this README are committed before any measurement.
4. `node scripts/evaluate-baseline.mjs --suite polyglot-heldout --record` measures FixMap and
   BM25-over-code on identical checkouts, once.

No ranking change may be made between steps 3 and 4. Any later ranking change that is
motivated by a miss here moves that case to a development cohort; a new held-out cohort is
then required for any further generalization claim.

## Candidate rule

For each language, GitHub repository search (language filter, sorted by stars, descending,
first 40 results on 2026-11-22), skipping archived repositories, repositories already used
by any earlier FixMap cohort, and repositories whose name or description matches tutorial,
list, course, or similar non-product patterns (exact pattern in `repositories.json`). The
first 15 survivors per language are listed in star order.

## Case rule

The same mechanical rule as `polyglot-dev`: per repository, the first of the 100 most
recently updated merged pull requests that closes an issue with at least 80 body
characters, is not docs-titled, changes at most 20 files, and modifies 1-3 non-test
implementation files in that language. Candidates are walked in order until four
repositories per language yield a case; later candidates are never queried. Repositories
without an eligible case are recorded under `skipped`.

## Pre-registered exit bar

Language support leaves preview only if all three hold on this cohort:

1. **No silent failures.** Every frozen case scans and ranks without an error.
2. **Every language works.** For each of the seven languages, FixMap places a fixing file
   in its Top-5 for at least one of that language's cases.
3. **Not worse than keyword search.** FixMap's overall Top-5 hit rate is at least
   BM25-over-code's Top-5 hit rate on the same cases.

If any condition fails, language support stays labelled preview, the result is still
recorded and published, and the misses become development cases.

This collection uses public GitHub metadata during development only. It adds no network,
API, account, or upload behavior to the FixMap product.

## Run log

- 2026-11-22, first measurement: aborted at case 24 of 28 when the evaluation machine's disk
  filled during a Git checkout (`unable to write file`). The run prints only timings until it
  finishes, so no hit or miss was observed and nothing was recorded. No code that affects
  ranking changed before the rerun; the only commit in between limits when the incremental
  scan index is used and batches optional semantic embedding, and both produce identical
  scan and ranking output.
- 2026-11-22, rerun after freeing disk space: recorded in `baseline-results.json`.

## Result (rerun, 2026-11-22)

| Condition | Outcome |
| --- | --- |
| 1. No silent failures | Pass: 28 of 28 cases scanned and ranked without error. |
| 2. Every language works | **Fail**: Java placed a fixing file in the Top-5 for 0 of 4 cases. Python 4/4, Rust 4/4, PHP 2/4, .NET 2/4, Go 1/4, Ruby 1/4. |
| 3. Not worse than keyword search | Pass: FixMap Top-5 50.0% (14/28) vs BM25-over-code 39.3% (11/28); Top-1 tied at 28.6%. |

Language support therefore stays labelled preview. BM25 also found 0 of 4 Java cases.

Java misses: `skylot/jadx#3014` and `termux/termux-app#5090` are rerank misses (the fixing
file was a candidate but ranked below the Top-5); `NationalSecurityAgency/ghidra#10055` is a
candidate-recall miss on a vague task; `iluwatar/java-design-patterns#3550` adds new files, so
its expected paths do not exist at the base commit and no ranker could hit them. The frozen
case rule did not exclude new-file fixes; it is not changed after measurement.

Per the bar above, the Java cases now move to development use. A newly frozen cohort is
required before language support can leave preview.
