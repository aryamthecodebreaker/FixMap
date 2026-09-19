# Incremental index acceptance

Status: in progress.

Evidence: scanner suite passed all 58 tests after rename/deletion differential
coverage was added. The later mixed staged/unstaged regression also passes,
comparing cached and uncached files, changed paths, and diff text.

The extended `scripts/stress-v0100.mjs` run verifies a one-file edit reuses 301
of 302 records and matches a fresh scan. Four concurrent analyses, corrupt-index
recovery, artifact isolation, link containment, and MCP error handling pass.

Observed local timings (single run, not a general performance claim): concurrent
cold population 1244 ms, exact-state warm 146 ms, one-file incremental 450 ms,
uncached fresh scan 319 ms. Incremental reuse was correct but slower than fresh
scanning on this small fixture. Do not count this as a performance win.

Repeated local measurement on 2026-09-19 (`node scripts/benchmark-incremental.mjs`):
five rounds per tier, alternating execution order, with identical file records
and diff text asserted each round. Median incremental/fresh times were 766/420 ms
at 100 files and 781/923 ms at 1,000 files. This supports a workload-dependent
benefit, not a blanket speedup; small-repository overhead remains unresolved.

Remaining: investigate incremental overhead with repeated size-tier measurements,
verify meaningful performance on the supported workloads, and run updated
regressions/stress through cross-platform CI. Preserve exact content validation;
do not substitute size/mtime-only reuse to make the benchmark faster.
