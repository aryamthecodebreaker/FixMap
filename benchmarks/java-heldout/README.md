# Java held-out cohort (fresh)

`polyglot-heldout` measured Java once: 0 of 4 fixing files in FixMap's top 5. Its README says a
ranking change motivated by a held-out miss moves those cases to development use and needs a new
held-out cohort for any further claim. This is that cohort.

## Order of operations

1. `repositories.json` continues the same frozen Java candidate list from `polyglot-heldout`
   (GitHub stars order, 2026-11-22) at the first candidate that cohort never queried
   (`jeecgboot/JeecgBoot`). Rule, limits and order are unchanged; pull requests already used by
   `polyglot-heldout` are excluded.
2. `node scripts/freeze-polyglot-cohort.mjs --suite java-heldout --record` froze the four cases from
   GitHub metadata only on 2026-11-24. FixMap was not run.
3. This README and `dataset.json` are committed before any Java ranking change and before any
   measurement on these cases.
4. After a candidate ranking change has been tuned only on development data (including the four
   `polyglot-heldout` Java cases, which are development cases from now on), it is measured here
   once with `node scripts/evaluate-baseline.mjs --suite java-heldout --record`, together with the
   unchanged ranking for comparison.

## Bar for the Java ranking change

The change ships only if, measured once here, FixMap's top-5 hits on these four cases are higher
with the change than without it, and no development or regression suite (`external`, `heldout`,
`polyglot-dev`, `multilanguage-dev`, other `polyglot-heldout` languages) loses a top-5 hit.
Otherwise it is reverted and the result is reported as measured.

## Result, 2026-11-24 (measured once)

Candidate: issue-title terms weigh twice in lexical and symbol BM25 when the issue text also
has a body (`rejected-title-weighting.patch`). Diagnosis on the four former `polyglot-heldout`
Java cases (now development cases): two were unwinnable by any ranking (one fix only created new
files; one shared no words with its task), and two were buried by long bodies. The candidate
found both of those (0 to 2 of 4).

| Suite | Top-5 without | Top-5 with |
| --- | --- | --- |
| **java-heldout (this cohort, measured once)** | **2 of 4** | **2 of 4** (same two cases) |
| heldout (TypeScript/JavaScript) | 11 of 12 | 11 of 12 |
| external | 16 of 16 | 16 of 16 |
| polyglot-dev | 14 of 19 | 16 of 19 |
| multilanguage-dev | 11 of 15 | 12 of 15 |
| polyglot-validation | 7 of 8 | 6 of 8 (lost rust-lang/cargo at rank 5 to 6) |

**Decision: not shipped.** The bar required more top-5 hits on this cohort with the change than
without it; both were 2 of 4. The change is reverted and kept only as the patch above. The
development gains suggest title weighting may help in general; that needs its own
pre-registered experiment and a fresh cohort, not this one.

Also measured: on never-seen Java, the unchanged ranker finds 2 of 4, not the 0 of 4 that
`polyglot-heldout` showed, where one of the four cases could not be won by any ranking.
