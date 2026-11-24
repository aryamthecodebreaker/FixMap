# Polyglot held-out cohort 2 (fresh, all seven languages)

`polyglot-heldout` decided language support once, on 2026-11-22, and failed its second
condition: Java placed a fixing file in the Top-5 for 0 of 4 cases. Its cases (and the
`java-heldout` cases) have been looked at since, so they are development cases now. This
cohort is new and is measured once, with FixMap 0.9.10's ranking unchanged.

## Order of operations

1. `repositories.json` continues every language's frozen candidate list at the first
   repository that no earlier cohort queried (rule below). None of the 68 candidates appears
   in any earlier FixMap cohort.
2. This README, `repositories.json` and the selection script change are committed before
   any case is frozen.
3. `node scripts/freeze-polyglot-cohort.mjs --suite polyglot-heldout-2 --record` freezes the
   cases from GitHub metadata only. FixMap is not run. `dataset.json` is committed.
4. `node scripts/evaluate-baseline.mjs --suite polyglot-heldout-2 --record` measures FixMap
   and BM25-over-code on identical checkouts, once.

No ranking change may be made between steps 2 and 4. A ranking change motivated by a miss
here moves that case to development use; any later claim needs another fresh cohort.

## Candidate rule

Each language's list continues the list frozen for `polyglot-heldout` on 2026-11-22 (GitHub
repository search by language, stars descending, first 40 results, skipping archived,
previously used, and tutorial/list-style repositories; first 15 survivors in star order).
For Java it continues `java-heldout`'s list, which already continued that one. Candidates
before and including the last one an earlier cohort queried are dropped; the rest keep their
order.

## Case rule

Same as `polyglot-heldout`: per repository, the first of the 100 most recently updated
merged pull requests that closes an issue with at least 80 body characters, is not
docs-titled, changes at most 20 files, and modifies 1-3 non-test implementation files in
that language. Pull requests already in `polyglot-heldout` or `java-heldout` are excluded.
Candidates are walked in order until four repositories per language yield a case; later
candidates are never queried.

**One change, fixed before freezing:** every counted fixing file must already exist at the
base commit. A pull request that adds a source file in that language is not eligible.
`polyglot-heldout` counted a fix that only created new files
(`iluwatar/java-design-patterns#3550`), which no ranker can find; that README recorded the
gap and left its own rule unchanged after measurement. This cohort closes it up front.

If a language runs out of candidates before four cases, its available cases are used and
the shortfall is recorded.

## Pre-registered exit bar

Unchanged from `polyglot-heldout`. Language support leaves preview only if all three hold:

1. **No silent failures.** Every frozen case scans and ranks without an error.
2. **Every language works.** For each of the seven languages, FixMap places a fixing file
   in its Top-5 for at least one of that language's cases.
3. **Not worse than keyword search.** FixMap's overall Top-5 hit rate is at least
   BM25-over-code's Top-5 hit rate on the same cases.

If any condition fails, language support stays labelled preview, the result is recorded and
published as measured, and the misses become development cases.

This collection uses public GitHub metadata during development only. It adds no network,
API, account, or upload behavior to the FixMap product.

## Result, 2026-11-24 (measured once, FixMap 0.9.10 ranking)

The run finished in one pass with no errors and no ranking change before or during it.

| Condition | Outcome |
| --- | --- |
| 1. No silent failures | Pass: 28 of 28 cases scanned and ranked without error. |
| 2. Every language works | Pass: Python 4/4, Go 4/4, Java 3/4, Rust 3/4, PHP 3/4, .NET 3/4, Ruby 2/4. |
| 3. Not worse than keyword search | Pass: FixMap Top-5 78.6% (22/28) vs BM25-over-code 67.9% (19/28). Top-1 tied at 12/28. |

**Decision: language support for Python, Java, Go, Rust, Ruby, PHP and .NET leaves preview.**

FixMap's Top-5 lead over BM25 is not statistically significant (paired McNemar exact test,
5 FixMap-only wins vs 2 BM25-only wins, p = 0.45; FixMap's 95% interval 60.5-89.8%). The bar
asked for "not worse", not for a significant win, and the result is reported that way.

Misses (now development cases): `keycloak/keycloak` (Java), `denoland/deno` (Rust),
`rapid7/metasploit-framework` and `hashicorp/vagrant` (Ruby), `monicahq/monica` (PHP), and
`huiyadanli/RevokeMsgPatcher` (.NET). Five are rerank misses (the fixing file was a
candidate but ranked below the Top-5); one is a candidate-recall miss. Ruby is the weakest
language here (2 of 4, BM25 3 of 4).
