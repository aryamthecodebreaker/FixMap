# Polyglot development cohort

This cohort covers Go, Rust, Ruby, PHP, and .NET. It is development-only and cannot support a generalization claim.

Freeze it before measuring FixMap:

```bash
node scripts/freeze-polyglot-cohort.mjs --record
```

The repository and language list is explicit in `repositories.json`. For each repository, selection takes the first of the 100 most recently updated merged pull requests that closes a substantive issue, is not documentation-titled, changes at most 20 files, and modifies 1–3 non-test implementation files in the configured language. The PR base commit and exact fixing paths are frozen from GitHub metadata before FixMap runs.

Repositories without an eligible case remain recorded under `skipped`; they are not replaced after ranking is observed. Cases that influence implementation stay permanently as regression evidence. A separate cohort frozen after development is required for any held-out claim.
