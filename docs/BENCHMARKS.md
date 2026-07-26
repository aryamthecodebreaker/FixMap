# Benchmarks

## Cross-repository ranking and efficiency

![FixMap benchmark: the fixing file ranked in the top three for 9 of 12 held-out repositories never tuned against and 15 of 15 in the regression suite, with a 1.75-second median scan and rank.](assets/fixmap-benchmark.svg)

Two suites answer two different questions. The [regression suite](../benchmarks/external/README.md) uses 15 repositories whose cases guided v0.7.1 ranking work, so it measures fit rather than generalization. The [held-out suite](../benchmarks/heldout/README.md) uses 12 further repositories selected by the identical frozen rule *after* the ranker was finished, and is never tuned against. Each case in both pins the repository state before the fix and freezes the fixing source paths before FixMap ranks anything.

Measured 2026-07-26 on Node v24.13.0, Windows 11 (10.0.26200), Intel Core i5-8350U:

| Quantity | Held-out (12) | Regression (15) | Evidence type |
| --- | ---: | ---: | --- |
| Expected fixing file in Top-1 | 8/12 (67%) | 9/15 (60%) | Measured |
| Expected fixing file in Top-3 | 9/12 (75%) | 15/15 (100%) | Measured |
| Expected fixing file in Top-5 | 9/12 (75%) | 15/15 (100%) | Measured |
| Median scan + rank time | — | 1,747.7 ms | Measured, three warm runs per pinned repository |
| Context proxy reduction | — | 98.56% | Estimated proxy, **not** a savings measurement |

**The held-out column is the one to plan around.** The regression column describes performance on cases that shaped the ranker and will overstate what happens on a repository FixMap has never seen.

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
