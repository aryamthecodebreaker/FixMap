# Annotation capability acceptance

Scope: durable `fixmap annotate`, ownership and expiry, file/symbol/service/contract
notes, and relevant evidence in plans. Local owner labels are declared metadata,
not authenticated identity or permission to modify a store. No account is required.

This checklist closes the existing capability; it does not add a new roadmap item.

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Durable add/list/remove | Shared atomic Core store; CLI, explicit MCP and opt-in Action operations; disposable packed consumer passed below | External workflow acceptance |
| Concurrent update safety | Packed Core holds an aged live lock while a separate installed CLI rejects mutation; bytes unchanged; retry retains both notes | Cross-platform consumer execution |
| Contained storage and targets | Junction/hard-link rejection and scope/path validation regressions | Confirm in clean consumer environments |
| Owner and expiry | Persisted metadata; scanner-to-change-scope exact expiry boundary and CODEOWNERS preservation | Frozen external workflow acceptance |
| Relevant notes and provenance | MCP/Action-to-plan exact saved-byte fingerprints, Markdown/JSON output | Frozen external workflow acceptance across interfaces |
| Renames and missing targets | Core assessments and real staged Git rename regression preserve store bytes while surfacing destination warning | External workflow acceptance |
| Service/contract names | Explicit named scopes; case-insensitive bounded literal mentions; regressions reject `api` in `rapid` and `api-client` | External workflow relevance; no invented service ownership mapping |
| Documentation | CLI help, README, Action guide, and consolidated `docs/annotations.md` workflow/limitations | Final candidate documentation review |

Do not mark complete based on this checklist's existence or synthetic tests alone.
Record exact package/repository revisions, commands, results, and failures for the
consumer campaign. Freeze external cases before execution; do not replace misses
with easier repositories. Existing regression fixtures are not held-out evidence.

## Recorded local consumer evidence (2026-09-13)

Candidate source checkpoint: `61205c7` (new rename integration test was uncommitted;
it does not affect package source). Versions remain 0.9.0 internally; no publication.
Packed CLI SHA-256: `9170cace6053454026c878f0bdbc4fe9b74458755d990a6a7c255deed18a184f`.
Packed Core SHA-256: `5ff9adf890e89af75add559fdfddb10e62e96cf410b1dbc64fa0ec0db1b4dd32`.

Both local tarballs were installed together into a new temporary npm project using
`npm install --ignore-scripts --no-audit --no-fund`; dependency inspection confirmed
the CLI deduplicated to the local Core package. Against a copied tiny-auth-app fixture,
the installed CLI added a file note with owner, listed its exact ID, included its note
in a JSON plan, removed it by ID, and listed an empty store. All assertions passed.
This verifies packaging and persisted operations, not held-out ranking quality.

`annotation-rename-integration.test.ts` creates a Git repository, commits source and
store, stages `git mv`, and runs the actual scanner/planner. It verifies rename diff
evidence, stale assessment, note rendering, unchanged store bytes, and no store diff.
The test and Core lint pass locally; cross-platform CI remains required.

The same packed consumer passed `node scripts/check-annotation-consumer.mjs
<consumer-project>`: Core persisted a first note and held its update lock while a
separate installed CLI process tried to add a second. The live lock was deliberately
aged to epoch time. The competing command exited 1 with the expected lock diagnostic,
without modifying either lock or store bytes. After release the retry exited 0 and
the installed CLI listed both exact notes. Child processes have a 30-second timeout;
the script removes only its own temporary fixture. This is Windows proof, not yet
cross-platform consumer evidence.

The compatibility workflow now builds and packs CLI/Core, installs those tarballs
into a fresh runner-temporary npm prefix with install scripts disabled, then runs
the consumer checker on Linux Node 20.11/22, Windows Node 24, and macOS Node 24.
The checker additionally proves an unknown-ID removal preserves the store and
exact-ID removals persist an empty list. The identical pack/install sequence and
expanded checker pass locally; cross-platform acceptance requires green runs of
this new step, not older compatibility results.

Named-scope acceptance reproduced substring pollution: `api` matched `rapid`.
Selection now requires literal mentions bounded by non-letter/non-number/non-underscore/
non-hyphen characters. Explicit contract file paths still independently establish
relevance. Service/contract regression tests cover unrelated substrings, distinct
hyphenated names, and a valid uppercase mention. This does not infer logical service
identity from names or grant authenticated ownership.

CI run 34749037719: the named `Verify packed annotation consumer` step was inspected
directly and passed on Linux Node 22 (job 103702081486) and macOS Node 24
(job 103702081513). Windows and the remaining job must be verified separately;
these results cover the packed concurrency/removal checker, not external relevance.

## External workflow campaign

`benchmarks/annotations/cases.json` was committed as `b9354ba` before execution.
The first three existing external-dataset repositories (Express, Axios, Debug) were
copied from exact pinned checkouts; no upstream scripts were executed. All three
passed file-note inclusion, exact store fingerprint, named-service inclusion and
unrelated-task exclusion, persisted removal, fresh-plan omission, and unchanged
target-source bytes. Run with `node scripts/evaluate-annotations.mjs` after building
Core. `benchmarks/annotations/results.json` preserves outcomes and the initial
evaluator failure: it incorrectly required an empty report section instead of the
contract's omitted section, then was corrected without changing product or cases.

This is external workflow proof on previously used repositories, not an untouched
held-out cohort or cross-interface external campaign. Owner expiry and CLI/MCP/Action
behavior have separate regressions; broader frozen workflow acceptance remains.

The unchanged three external cases also passed actual CLI and bundled Action child
processes for positive-note parity, exact store fingerprints, and post-removal
absence. Children receive only a minimal host environment plus explicit Action
inputs, no GitHub token or inherited event. Each child has a 60-second timeout.
Fresh JS/Python workflow cases were separately frozen in `59a429c` before execution;
both passed the same frozen scenarios on Core/CLI/Action without changes or retries.
See `benchmarks/annotations/heldout-results.json`. These two cases establish workflow
transfer only, not general ranking quality, and cannot substitute for MCP acceptance.
