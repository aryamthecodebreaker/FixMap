# Benchmarks

## Cross-repository ranking and efficiency

![FixMap benchmark: the fixing file ranked in the top three for 8 of 12 held-out repositories never tuned against and 16 of 16 in the regression suite, with a 1.75-second median scan and rank.](assets/fixmap-benchmark.svg)

Two suites answer two different questions. The [regression suite](../benchmarks/external/README.md) uses 16 repositories whose cases have guided ranking work, so it measures fit rather than generalization. The [held-out suite](../benchmarks/heldout/README.md) uses 12 further repositories selected by the identical frozen rule and rotates any case that informs a ranking change, so it remains unseen evidence. Each case in both pins the repository state before the fix and freezes the fixing source paths before FixMap ranks anything.

Ranking outputs refreshed 2026-07-31 on Node v24.13.0, Windows 11 (10.0.26200), Intel Core i5-8350U; the scan-time measurement remains from 2026-07-26:

| Quantity | Held-out (12) | Regression (16) | Evidence type |
| --- | ---: | ---: | --- |
| Expected fixing file in Top-1 | 7/12 (58%) | 11/16 (69%) | Measured, **pooled — see cohorts below** |
| Expected fixing file in Top-3 | 8/12 (67%) | 16/16 (100%) | Measured, **pooled — see cohorts below** |
| Expected fixing file in Top-5 | 9/12 (75%) | 16/16 (100%) | Measured, **pooled — see cohorts below** |
| Median scan + rank time | — | 1,747.7 ms | Measured, three warm runs per pinned repository |
| Context proxy reduction | — | 98.56% | Estimated proxy, **not** a savings measurement |

**The held-out column is the one to plan around.** The regression column describes performance on cases that shaped the ranker and will overstate what happens on a repository FixMap has never seen.

### Cohorts: tasks that already name the fixing file

Some benchmark tasks contain a fixing path in the task text — `Location: lib/document.js:2339` in
the mongoose case, and GitHub permalinks to the exact file and line range in the svelte and yargs
cases. A ranker with an explicit-file-mention signal answers those by reading the task rather than
by searching the repository, so pooling them into a single rate lets a handful of cases carry a
generalization headline.

Classification is derived at evaluation time by
[`scripts/lib/expected-path-mention.mjs`](../scripts/lib/expected-path-mention.mjs) from the same
task text the ranker reads — never stored in `dataset.json`, where it would drift from the case it
describes. Three tiers are recorded: a repository-root-anchored full path (including inside a
`github.com/<owner>/<repo>/blob/<ref>/<path>` permalink), a multi-segment path suffix such as a
`tsc` error naming `src/query/react/buildHooks.ts`, and a bare basename. The first two count as
named; a bare `index.ts` is ordinary prose in an issue and does not.

| Suite | Cohort | Cases | Top-1 | Top-3 | Top-5 |
| --- | --- | ---: | ---: | ---: | ---: |
| Held-out | Task did not name the file | 9 | **44.4%** (95% CI 19–73%) | **55.6%** (95% CI 27–81%) | 66.7% |
| Held-out | Task named the file | 3 | 100% | 100% | 100% |
| Held-out | Pooled | 12 | 58.3% | 66.7% | 75.0% |
| Regression | Task did not name the file | 13 | 69.2% | 100% | 100% |
| Regression | Task named the file | 3 | 66.7% | 100% | 100% |
| Regression | Pooled | 16 | 68.8% | 100% | 100% |

**Read this as a structural correction, not a measured effect size.** The regression suite barely
moves under the split, and its named cases are 2/3 rather than 3/3 — so being named does not
guarantee a hit. With three cases per named cohort, how much a mention is worth is not established.
What is established is that a generalization headline should not be computed over tasks that
contain their own answer.

## Baseline-relative ranking

A hit rate published on its own does not answer the question a reader actually has: is this better
than what an agent already gets by searching the repository itself?
[`scripts/evaluate-baseline.mjs`](../scripts/evaluate-baseline.mjs) scores three naive arms and
FixMap on **one `scanRepo()` result per case, shared by every arm** — the same file list, the same
text samples, the same truncation — so a difference in score is a difference in ranking.

| Arm | What it does |
| --- | --- |
| `path-extraction` | Pulls path-shaped tokens out of the task text and keeps those resolving to a real file. Ranks nothing; it prices what the task text was carrying. |
| `lexical-literal` | Literal keyword search: distinct query terms matched, then raw occurrence count. No corpus statistics. |
| `bm25` | Standard BM25 (k1 = 1.2, b = 0.75) over the same text. A retrieval baseline, **not** a grep. |
| `fixmap` | `rankContextFiles` from `@aryam/fixmap-core`. |

Both keyword arms are case-insensitive and expand camelCase, which favours the baselines. That is
deliberate — a handicapped baseline proves nothing.

Held-out suite, cases whose task did not name the file (9):

| Arm | Top-1 | Top-3 | Top-5 |
| --- | ---: | ---: | ---: |
| `path-extraction` | 0.0% | 0.0% | 0.0% |
| `lexical-literal` | 11.1% | 22.2% | 33.3% |
| `bm25` | 11.1% | 22.2% | 33.3% |
| `fixmap` | **44.4%** | **55.6%** | **66.7%** |

Regression suite, same cohort (13):

| Arm | Top-1 | Top-3 | Top-5 |
| --- | ---: | ---: | ---: |
| `path-extraction` | 0.0% | 0.0% | 0.0% |
| `lexical-literal` | 7.7% | 30.8% | 30.8% |
| `bm25` | 15.4% | 30.8% | 38.5% |
| `fixmap` | **69.2%** | **100%** | **100%** |

`path-extraction` scoring exactly 0.0% on the unmentioned cohort of both suites, and 66.7% on the
named cohort, is the independent check that the cohort classifier measures what it claims.

Arms are compared with **McNemar's exact test** rather than by comparing two Wilson intervals: the
arms ran on the same cases, and that pairing carries information independent intervals discard.

| Suite | Cohort | FixMap vs | Top-1 p | Top-3 p | Top-5 p |
| --- | --- | --- | ---: | ---: | ---: |
| Regression | unmentioned (13) | `lexical-literal` | 0.0078 | 0.0039 | 0.0039 |
| Regression | unmentioned (13) | `bm25` | 0.0156 | 0.0039 | 0.0078 |
| Held-out | unmentioned (9) | `lexical-literal` | 0.25 | 0.25 | 0.25 |
| Held-out | unmentioned (9) | `bm25` | 0.25 | 0.25 | 0.375 |

FixMap never loses a disagreeing case to any baseline on the regression suite, and loses exactly one
across the entire held-out comparison. The held-out p-values are **not** evidence of no effect: with
three disagreeing cases the smallest attainable two-sided p-value is 0.25, so that cohort is
arithmetically incapable of reaching 0.05. It is underpowered, which is the strongest available
argument for growing it.

```bash
node scripts/evaluate-baseline.mjs --suite heldout
node scripts/evaluate-baseline.mjs --suite external
node scripts/evaluate-baseline.mjs --suite heldout --record
```

Per-arm rankings for every case are recorded in `benchmarks/<suite>/baseline-results.json`.

The context comparison is intentionally a proxy:

- **Assumed baseline:** send every scanned text-bearing file in FixMap's supported extension set—22,058,578 estimated tokens.
- **FixMap comparison:** send only the Top-5 ranked files—318,546 estimated tokens.
- **Estimator:** UTF-8 file bytes ÷ 4. This is not tokenizer output and does not include prompts, tool protocol, or generated responses.

The supported set is `.cjs`, `.css`, `.go`, `.js`, `.json`, `.jsx`, `.md`, `.mjs`, `.py`, `.rs`, `.ts`, `.tsx`, `.yaml`, and `.yml`, so the assumed baseline includes tests, documentation, and configuration—not only implementation code.

The visual also shows a 14.97-minute implied difference against an **assumed 15-minute manual-triage baseline**. That baseline was not measured in a controlled with/without-agent experiment, so it is not presented as a real-world time-savings claim.

Run or deliberately refresh the evidence:

```bash
npm run evaluate:external
npm run benchmark:savings
npm run benchmark:savings:record
npm run render:benchmark-card
```

See [`benchmarks/external/README.md`](../benchmarks/external/README.md) for case selection, exact repositories, fresh baseline comparison, and every recorded ranking.

## Scanner performance

FixMap caps repository scans at 25,000 files. This page documents measured scan performance on deterministic synthetic repositories so the cap and its cost are inspectable rather than asserted.

## Harness

[`scripts/benchmark-scan.mjs`](../scripts/benchmark-scan.mjs) generates synthetic repositories from a fixed seed (identical trees on every machine) and scans them with `scanRepo` from `@aryam/fixmap-core`:

- modules of ten files each (eight TypeScript sources, one test, one README) so the tree exercises code/test/documentation classification
- 250 files spread across `node_modules/`, `dist/`, `.vercel/`, and `coverage/` that the scanner must skip entirely
- a 40,000-file tier that must stop at the 25,000-file cap and emit the `scan-limit-reached` diagnostic
- each scan runs in a fresh child process, so peak RSS reflects only the scan; the reported time is the median of three runs

```bash
npm run build:core
node scripts/benchmark-scan.mjs            # full run, prints this table
node scripts/benchmark-scan.mjs --tier 1000 --check   # correctness only, used in CI
```

Fixtures are generated under the OS temp directory once and reused; delete `fixmap-bench-*` to regenerate.

## Results

Measured 2026-07-14 — Node v24.13.0, Windows 11 (10.0.26200), Intel Core i5-8350U @ 1.70 GHz, NTFS:

| Generated files | Scanned files | Median scan time | Peak RSS | Scan-limit diagnostic |
| --- | --- | --- | --- | --- |
| 1,000 | 1,000 | 2,366 ms | 48 MB | no |
| 5,000 | 5,000 | 9,837 ms | 54 MB | no |
| 20,000 | 20,000 | 42,201 ms | 68 MB | no |
| 40,000 | 25,000 | 65,660 ms | 87 MB | yes |

Reading of the numbers:

- scan time grows roughly linearly (~2.1–2.4 ms per file on this machine) and is dominated by per-file I/O — Windows/NTFS stat and read latency is the main cost, so expect materially faster absolute times on Linux and on SSD-backed CI runners
- memory stays modest and sublinear (48 → 87 MB from 1k to the 25k cap) because only files under 64 KB keep a text sample
- ignored directories are skipped without being read, and the 25,000-file cap holds exactly, with the diagnostic present

## CI guard

`npm run benchmark:check` runs the 1,000-file tier in CI and asserts only deterministic facts: the exact scanned-file count, that no ignored-directory path leaks into results, and the presence/absence of the scan-limit diagnostic. Wall-clock timing is deliberately never asserted anywhere, so the suite cannot flake on slow runners; timings are published here instead.
