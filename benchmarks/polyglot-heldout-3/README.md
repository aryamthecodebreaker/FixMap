# Polyglot held-out cohort 3 (large, for a significance test)

`polyglot-heldout-2` showed FixMap not worse than BM25 over code on 28 fresh cases (22 vs 19
Top-5 hits), but the difference was not statistically significant (paired McNemar exact,
p = 0.45). Across every recorded cohort the disagreements split about 3 to 1 in FixMap's
favour, and at that ratio 28 cases cannot show significance. This cohort is large enough
to test it (about 105 cases) and is measured once.

## Order of operations

1. `node scripts/build-cohort-candidates.mjs --suite polyglot-heldout-3 --per-language 30 --record`
   wrote `repositories.json` from GitHub search metadata only (rule below).
2. This README, `repositories.json`, and the script changes are committed before any case is
   frozen.
3. `node scripts/freeze-polyglot-cohort.mjs --suite polyglot-heldout-3 --record` freezes the
   cases from GitHub metadata only. FixMap is not run. `dataset.json` is committed.
4. `node scripts/evaluate-baseline.mjs --suite polyglot-heldout-3 --discard-checkouts --record`
   measures FixMap and BM25-over-code on identical checkouts, once, with FixMap 0.9.14's
   ranking unchanged. `--discard-checkouts` only deletes each checkout after its case is
   scored, to fit on disk; it does not change any result.

No ranking change may be made between steps 2 and 4.

## Candidate rule

For each language (Python, Java, Go, Rust, Ruby, PHP, C#), GitHub repository search with a
language filter, sorted by stars descending, first 100 results on 2026-11-25. Archived
repositories, forks, every repository listed or used by any earlier FixMap cohort, and
tutorial/list-style repositories (exact pattern in `repositories.json`) are skipped. The
first 30 survivors per language are listed in star order.

## Case rule

The same rule as `polyglot-heldout-2`: per repository, the first of the 100 most recently
updated merged pull requests that closes an issue with at least 80 body characters, is not
docs-titled, changes at most 20 files, and modifies 1-3 non-test implementation files in that
language, all of which already exist at the base commit. Candidates are walked in order until
15 repositories per language yield a case; later candidates are never queried. If a language
runs out of candidates, its available cases are used and the shortfall is recorded.

## Pre-registered bar

1. **No silent failures.** Every frozen case scans and ranks without an error.
2. **A significant win over keyword search.** FixMap places a fixing file in its Top-5 for more
   cases than BM25 over code, and the paired McNemar exact test on Top-5 (two-sided, as
   recorded in `pairedVsFixmapMcnemarExact.all["bm25:code"].top5.pValue`) gives p < 0.05.

Per-language results and Top-1 are reported but are not part of the bar.

If both hold, the website may say FixMap finds the fixing file significantly more often than
keyword search on never-seen code in these seven languages. If either fails, the result is
recorded and published as measured, the claim is not made, and ranking work continues on
development cases only.

This collection uses public GitHub metadata during development only. It adds no network,
API, account, or upload behavior to the FixMap product.

## Run log

- 2026-11-25, first attempt on Windows: stopped at case 64 of 105 when Git could not check out
  `CocoaPods/CocoaPods` (fixture paths contain `*` and `?`, which Windows cannot create). The
  run prints only timings until it finishes, so no hit or miss was observed and nothing was
  recorded. No code that affects ranking changed before the rerun.
- The measurement is therefore run once on Linux (GitHub Actions `ubuntu-24.04`, workflow
  `heldout-eval.yml`, branch `eval/polyglot-heldout-3`), with the same frozen dataset and
  FixMap 0.9.14 ranking. Earlier cohorts were measured on Windows; results are compared only
  within this cohort, where both arms ran on the same Linux checkouts.

## Result, 2026-11-25 (measured once on Linux, FixMap 0.9.14 ranking)

| Condition | Outcome |
| --- | --- |
| 1. No silent failures | Pass: 105 of 105 cases scanned and ranked without error. |
| 2. A significant win over keyword search | **Fail**: FixMap Top-5 73/105 (69.5%) vs BM25-over-code 69/105 (65.7%); 14 FixMap-only vs 10 BM25-only cases, paired McNemar exact p = 0.54. |

**Decision: the claim is not made.** On never-seen code in these seven languages FixMap is
about as good as keyword search, not significantly better. At Top-1 BM25 is slightly ahead
(44 vs 40 of 105, p = 0.54).

| Language | FixMap Top-5 | BM25 Top-5 |
| --- | --- | --- |
| Python | 9/15 | 11/15 |
| Java | 13/15 | 12/15 |
| Go | 7/15 | 8/15 |
| Rust | 11/15 | 12/15 |
| Ruby | 12/15 | 9/15 |
| PHP | 12/15 | 11/15 |
| .NET (C#) | 9/15 | 6/15 |

FixMap's 95% interval for Top-5 is 60.2-77.5%. Of its 32 misses, 24 are rerank misses (the
fixing file was a candidate but ranked below the Top-5) and 8 are candidate-recall misses.

What this corrects: across all earlier recorded cohorts, cases where only one method found
the file split about 3 to 1 for FixMap. Most of those cohorts were development sets FixMap
had been tuned on. On this fresh, larger set the split is 14 to 10. These cases are now
development cases; any ranking change motivated by them needs another fresh cohort.
