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
