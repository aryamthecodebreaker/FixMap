# Incremental index acceptance

Status: in progress.

Staged/worktree identity regression: staging different content and then restoring
the HEAD text in the worktree poisoned an incremental record with the staged blob
ID. After committing the index and updating the worktree, a cached scan returned
old text while a fresh scan returned current text. A new real-Git regression
reproduced this failure. Dirty detection now compares worktree to index (the source
of blob fingerprints), not HEAD. Exact-scan and incremental record versions are
bumped to reject previously poisoned records; the index filename is unchanged.
After the fix, all 59 scanner tests, the Core TypeScript build, and Core lint pass
locally. After regenerating the checked-in Action bundle, checkpoint `def6d3a`
passes full CI run 35454698679 (including Linux, Windows, and macOS compatibility)
and external evaluation 35454698713. Performance acceptance remains outstanding.

The post-fix 302-file stress run passes four concurrent analyses, exact one-file
incremental/fresh equality, corrupt-cache recovery, artifact isolation, link
containment, and MCP protocol checks. Incremental/fresh times were 646/402 ms on
this small fixture; correctness does not establish a speedup.

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

Follow-up calibration measured the same Git commands used to establish the exact
cache key, separately from scan timing. Median incremental/fresh/probe times were
612/335/251 ms at 100 files and 1104/1074/355 ms at 1,000 files. Every paired scan
remained identical. The fixed Git-state work is a substantial candidate contributor
to small-repository overhead; this is a separate probe, not an internal profile,
and its duration must not be subtracted to manufacture an adjusted speedup.

Pre-commit repeat: all ten paired comparisons passed again. Median
incremental/fresh/probe times were 431/249/191 ms at 100 files and 734/738/232 ms
at 1,000 files, reinforcing the small-repository overhead and near tie at the
larger tier rather than establishing a stable performance improvement.

Expanded three-tier run completed with exit code 0 and all 15 paired comparisons
equal. Median incremental/fresh times were 719/487 ms at 100 files, 1115/1027 ms
at 1,000 files, and 3358/6204 ms at 10,000 files. At 10,000 files the incremental
rounds were [3989, 3369, 2935, 3358, 3217] ms; fresh rounds were
[7164, 6204, 5450, 5790, 6488] ms. The approximately 46% median reduction is local
synthetic-fixture evidence, not a universal or cross-platform speed claim.

The initial large-fixture attempts timed out in `git add` before scanning, then
cleanup reported a Windows directory lock. The harness now exposes the original
failure, emits completed tiers before cleanup, gives asynchronous fixture Git
setup 120 seconds, and sets fixture-local `core.autocrlf=false`. Setup remains
outside scan timings; no user Git configuration changes. The successful run
completed cleanup too.

Remaining: reduce fixed overhead on small repositories, verify the large-tier
benefit on independent realistic workloads, and run the expanded performance/stress
checks across platforms. Scanner correctness already passes cross-platform CI at
the checkpoint above. Preserve exact content validation; do not substitute
size/mtime-only reuse to make the benchmark faster.
