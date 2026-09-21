# Incremental index acceptance

Status: in progress.

Scanner-to-graph integration: a real temporary Git repository now feeds scanner
fingerprints directly into an identity graph. After a same-size tracked edit,
the incremental scan reuses the unchanged file, matches a fresh scan, and changes
the edited file's fingerprint. Invalidation marks that file and its derived
symbol stale while leaving the unrelated file and repository node valid. All ten
identity-graph tests pass locally, including this integration (not only synthetic
fingerprint inputs).

Windows fixture setup reliability: CI 35522944596 failed before the large-tier
scan because a single `git add .` exceeded 120 seconds; its cleanup then saw a
locked directory. Setup now stages the same files in batches of at most 250,
without changing the corpus or measured scan boundary. A full local run completed
with exit 0, all 15 comparisons equal, and successful cleanup. Median
incremental/fresh times were 470/217 ms (100), 1134/1192 ms (1,000), and
7121/18750 ms (10,000). These noisy local timings are not a controlled comparison
with earlier runs. CI 35571703228 subsequently passed the prior unbatched
checkpoint, confirming the timeout is intermittent; remote validation of batching
is still required.

Large real-corpus working-tree validation (2026-09-21): webpack pinned commit
`61d4136e6d16bb52b13802a1a02ed56bdfafbdb3`, editing `lib/Compiler.js`, scanned
13,464 files. All five rounds matched fresh file records, changed paths, and a
nonempty diff containing the round-specific edit marker. The isolated local clone
and its scan cache were cleaned successfully (exit 0); no repository code ran.
Incremental timings were [6474, 8016, 11399, 8450, 6728] ms, fresh timings
[10469, 7860, 10634, 8919, 7653] ms; medians 8016/8919 ms. The roughly 10% lower
median is variable local evidence: incremental was slower in two of five paired
rounds. It does not establish a universal speed guarantee. The existing incomplete
webpack cache was preserved; a separate pinned source checkout was fetched for
this validation and retained under DevCache for reproducibility.

Working-tree coverage correction: earlier scan-only comparisons requested no diff,
so their equal changed-file lists/diff text were empty, not proof of diff parity.
The mixed staged/unstaged regression now requests `workingTree: true`, asserts the
actual changed path and replacement text, and passes alongside the staged-blob
identity regression (two focused tests). The real-corpus harness now likewise
requires the edited path and round-specific marker in a nonempty diff. Axios
passes five rounds with this stronger contract: incremental
[1151, 1951, 2205, 1692, 1640] ms, fresh [657, 706, 983, 1661, 2038] ms; medians
1692/983 ms. These working-tree timings are not directly comparable to prior
scan-only timings.

A separate scan-only run against an isolated FixMap clone at
`66f008bcc1e549b88ce734e09fa3a97e817689ad` passed five file-record comparisons
across 422 scanned files. Medians were 843/539 ms incremental/fresh, reinforcing
small-corpus overhead on a second real repository rather than a speedup.

Commit identity/status consolidation: a real-Git trace regression reproduced
separate `rev-parse HEAD` calls during exact-state cache validation. Validation now
uses the documented porcelain-v2 branch OID from the same status command, with
ahead/behind counting disabled, while retaining untracked detection and the full
binary diff for changed content. Exact-scan cache version is 9. All 60 scanner
tests, Core lint/build, and generated Action freshness pass locally; new remote
acceptance is pending. The benchmark's separate Git probe uses the same commands.
Axios revalidation remains exact for all five rounds: incremental times
[1063, 972, 825, 830, 756] ms, fresh [556, 546, 511, 451, 665] ms; medians
830/546 ms. This still shows overhead and is not a controlled before/after speed
claim against the earlier run under different host load.

Real-corpus local validation: `scripts/benchmark-incremental-real.mjs` clones an
existing local Git checkout into a disposable directory without hardlinks, edits
only that clone, and never runs its code. Axios commit
`ff60b43277c32a5b2f7589c917db16d8e043c0d4`, editing `lib/core/Axios.js`, yielded
454 scanned files and five exact incremental/fresh comparisons (including changed
paths and diff text), with successful cleanup. Incremental times were
[1510, 1469, 1134, 929, 970] ms and fresh times [1222, 1388, 651, 695, 442] ms;
medians 1134/695 ms. Real small-corpus evidence confirms overhead, not a speedup.
The cached webpack directory lacked Git metadata and was rejected before any
fixture was created; it was not repaired, fetched, or counted as a result.

Cross-platform measurements for `adbfa93`, CI run 35521854019 (2026-09-20):
the Linux Node 20.11/22 and Windows/macOS Node 24 jobs pass the expanded stress and
three-tier benchmark. Each tier performs five alternating-order paired scans
and asserts identical files and diff text plus actual incremental reuse.

| Runner | 100 files incremental/fresh ms | 1,000 files | 10,000 files |
| --- | ---: | ---: | ---: |
| Linux Node 20.11 | 31/22 | 110/132 | 894/1201 |
| Linux Node 22 | 28/20 | 89/127 | 707/1142 |
| macOS Node 24 | 51/26 | 114/112 | 987/1193 |
| Windows Node 24 | 138/65 | 253/202 | 1424/1660 |

These synthetic workloads show a large-tier benefit and small-tier overhead;
they do not establish a universal speedup. All five CI jobs completed successfully;
external evaluation 35521853962 also passed at this checkpoint.
The subsequent local rerun passed the two smaller tiers but timed out in the
10,000-file fixture's `git add` setup (120 seconds), before scan measurements;
that attempt is not counted as a successful large-tier run.

Tracked-path enumeration optimization: a real-Git trace regression first failed
because scanning launched a redundant `git ls-files --cached -z` after reading
the index. The scanner now reuses paths from its existing staged-index output,
including worktree-deleted tracked files, and preserves internal exclusions and
non-Git fallback. All 60 scanner tests, Core lint, and the Action/Core build pass
locally. This proves removal of one subprocess, not a measured end-to-end speedup;
the following timing results predate this optimization.

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
