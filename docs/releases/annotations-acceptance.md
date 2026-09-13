# Annotation capability acceptance

Scope: durable `fixmap annotate`, ownership and expiry, file/symbol/service/contract
notes, and relevant evidence in plans. Local owner labels are declared metadata,
not authenticated identity or permission to modify a store. No account is required.

This checklist closes the existing capability; it does not add a new roadmap item.

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Durable add/list/remove | Shared atomic Core store; CLI, explicit MCP and opt-in Action operations; disposable packed consumer passed below | External workflow acceptance |
| Concurrent update safety | Lock rejection, including an aged live writer; failed updates preserve bytes | Cross-process packaged-consumer concurrency |
| Contained storage and targets | Junction/hard-link rejection and scope/path validation regressions | Confirm in clean consumer environments |
| Owner and expiry | Persisted metadata; scanner-to-change-scope exact expiry boundary and CODEOWNERS preservation | Frozen external workflow acceptance |
| Relevant notes and provenance | MCP/Action-to-plan exact saved-byte fingerprints, Markdown/JSON output | Frozen external workflow acceptance across interfaces |
| Renames and missing targets | Core assessments and real staged Git rename regression preserve store bytes while surfacing destination warning | External workflow acceptance |
| Service/contract names | Explicit named scopes and task-name relevance | Verify relevance and unrelated-name negatives; no invented service ownership mapping |
| Documentation | CLI help, README and Action guide | Consolidated user workflow and limitation review |

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
