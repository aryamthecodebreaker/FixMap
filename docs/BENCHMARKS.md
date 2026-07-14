# Scanner Performance Benchmarks

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
