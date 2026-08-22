# Multi-language development cohort

This cohort is for reranker development, not a generalization claim. It was frozen before FixMap was measured by running:

```bash
node scripts/freeze-multilanguage-cohort.mjs --record
```

The repository list is explicit in `repositories.json`. Selection reads GitHub issue and fixing-PR metadata only, uses the PR base commit as the buggy checkout, and labels the 1–3 changed Python or Java implementation files as expected starting points. It does not call FixMap.

Cases that later influence ranking remain here permanently as regression evidence. A separate cohort, frozen after the reranker is finished, is required for any new generalization claim.
