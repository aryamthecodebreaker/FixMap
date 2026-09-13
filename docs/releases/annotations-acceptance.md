# Annotation capability acceptance

Scope: durable `fixmap annotate`, ownership and expiry, file/symbol/service/contract
notes, and relevant evidence in plans. Local owner labels are declared metadata,
not authenticated identity or permission to modify a store. No account is required.

This checklist closes the existing capability; it does not add a new roadmap item.

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Durable add/list/remove | Shared atomic Core store; CLI, explicit MCP and opt-in Action operations | Disposable packaged-consumer workflow |
| Concurrent update safety | Lock rejection, including an aged live writer; failed updates preserve bytes | Cross-process packaged-consumer concurrency |
| Contained storage and targets | Junction/hard-link rejection and scope/path validation regressions | Confirm in clean consumer environments |
| Owner and expiry | Persisted metadata; scanner-to-change-scope exact expiry boundary and CODEOWNERS preservation | Frozen external workflow acceptance |
| Relevant notes and provenance | MCP/Action-to-plan exact saved-byte fingerprints, Markdown/JSON output | Frozen external workflow acceptance across interfaces |
| Renames and missing targets | Core assessments; renamed destination report/path visibility regression | Verify review-only behavior in a real Git rename workflow |
| Service/contract names | Explicit named scopes and task-name relevance | Verify relevance and unrelated-name negatives; no invented service ownership mapping |
| Documentation | CLI help, README and Action guide | Consolidated user workflow and limitation review |

Do not mark complete based on this checklist's existence or synthetic tests alone.
Record exact package/repository revisions, commands, results, and failures for the
consumer campaign. Freeze external cases before execution; do not replace misses
with easier repositories. Existing regression fixtures are not held-out evidence.
