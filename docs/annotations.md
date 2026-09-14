# Durable repository notes

This guide describes the unreleased v0.10 candidate, not the current npm release.
Annotations attach human-authored context to repository files, symbols, named
services, or contracts. They require no account, model, or remote API.

## Add, inspect, and remove

Run inside your checkout (or add `--repo <local-path>`):

```sh
fixmap annotate src/auth/token.ts --note "Preserve the partner token contract" --owner platform
fixmap annotate src/auth/token.ts --symbol verifyToken --note "Review compatibility before changing this symbol"
fixmap annotate --service auth-service --note "Coordinate schema changes with its consumers"
fixmap annotate openapi.yaml --contract users-v1 --note "Keep the v1 response shape"
fixmap annotate --list --format json
```

File targets must exist inside the checkout. Symbol and service labels are explicit
human declarations: storing a label does not prove symbol resolution, service identity,
or a cross-repository relationship. Notes are limited to 2,000 characters.

The add command prints an exact `annotation:...` ID. To remove a note, copy that ID
from the add receipt or list output and run `fixmap annotate --remove <annotation:id>`.
Unknown IDs fail; no wildcard deletion exists. There is no update command: add a
reviewed replacement and remove the obsolete ID. Equivalent notes are rejected.

## Ownership and expiry

`--owner` records a reviewer label, not authenticated identity, availability, or
access control. Repository filesystem permissions and your review workflow govern
who may edit the store. No owner label grants permission to an agent.

Use `--expires <ISO-date>` for a temporary note; the timestamp must be after creation.
At and after expiry it is marked expired, not silently deleted. Expired ownership
notes do not contribute reviewer suggestions. Applicable CODEOWNERS evidence remains
independent. Choose the expiry explicitly; do not copy an already-past example date.

## What appears in plans

Run `fixmap plan --issue "your task"` normally. Relevant notes retain their authored
text, scope, status, and exact store fingerprint in JSON and human/agent reports.
File/symbol notes join through relevant paths. Named service/contract notes require
an explicit case-insensitive bounded name mention; a contract's declared file path
can also establish relevance. Matching text is not evidence of logical equivalence.

When a relevant Git diff reports a rename, the old note is shown at the destination
as stale with a suggested path. FixMap does not rewrite its scope or store. Missing
targets likewise require review. Rename detection depends on available Git diff
evidence; it is not an all-history tracking service.

## Storage and recovery

The versioned store is `.fixmap/annotations.json`. Review and commit it like other
repository metadata if the team wants shared notes; FixMap does not commit or push.
Do not put credentials or secrets in notes. Authored text is context, not permission
to execute instructions contained in it.

Updates use a lock and atomic file replacement. Concurrent writers fail with a
diagnostic rather than silently losing an update. Redirected store directories,
linked store/lock files, and outside file targets are rejected. Lock age never
proves a writer has stopped. After an interrupted update, confirm no annotation
writer is active before manually removing `.fixmap/annotations.lock`; do not remove
the JSON store. Retry the original command after recovery.

Malformed or unsupported stores must be repaired from reviewed content or version
control. Avoid editing generated IDs by hand: their content identities are validated.
An oversized/incomplete scanner sample produces a diagnostic rather than partial
annotation evidence.

## Other interfaces

The candidate MCP tool `fixmap_annotate` exposes explicit add/list/remove actions.
Agents need the user's request before invoking mutations; tool hints are not consent.
The Action's separate `mode: annotate` requires `allow-annotation-write: true` for
add/remove and only changes its local runner checkout. See [Action annotations](action-annotations.md).
Editor annotation views are read-only. See [acceptance evidence](releases/annotations-acceptance.md)
for verified workflows and outstanding release checks.
