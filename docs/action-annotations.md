# Annotation operations in the candidate Action

The unreleased candidate supports `mode: annotate` as a separate local-checkout
operation. It does not analyze an issue or diff, execute repository code, post a
GitHub comment, commit, or push. Existing plan/verify defaults are unchanged.

After explicitly checking out the candidate, a workflow can use its local Action:

```yaml
- uses: ./
  with:
    mode: annotate
    allow-annotation-write: true
    annotation-request: >-
      {"action":"add","scope":{"kind":"service","name":"auth"},
       "note":"Preserve the reviewed customer contract","owner":"platform"}
```

Use only authored or reviewed inputs. Do not interpolate untrusted PR titles,
bodies, comments, or repository-generated commands into a write request. The
write flag is an explicit workflow authorization, not a validation that the note
is true or that the caller owns the service.

`annotation-request` is JSON, capped at 32 KiB:

- `list`: only `action`. No write flag is required; reading an absent store does
  not create one.
- `add`: `action`, `scope`, `note`, optional `owner` and `expiresAt` (ISO date).
  Scope is a file (`kind`, `path`), symbol (`kind`, `path`, `symbol`), service
  (`kind`, `name`), or contract (`kind`, `name`, optional `path`). File targets
  must already exist within the checkout. Creation time is the operation time.
  Unknown scope fields and fields belonging to another scope kind are rejected,
  not silently discarded (for example, a service scope cannot include a path).
- `remove`: `action` and exact annotation `id`. Unknown IDs fail; no broad deletion
  operation exists.

Add/remove require `allow-annotation-write: true`. The shared Core store validates
records, locks updates, rejects redirected stores, and atomically replaces
`.fixmap/annotations.json`. Rejected updates preserve existing store contents.
Locks are never stolen based on age: a suspended writer may still be active.
After an interrupted update, confirm that no annotation writer is running before
manually removing `.fixmap/annotations.lock` and retrying. Do not remove the store.

Output is JSON regardless of the plan-mode `format` setting. The `report` output
contains the list or a mutation receipt; the step summary includes the same JSON.
Oversized lists fail rather than return invalid truncated JSON. Plan/verify
inputs such as issue, diff, report-path, and non-default scan flags are rejected.
No context-count or test-route-count is emitted in annotation mode.

Changes exist only in the runner checkout. Persist the store through a separately
reviewed artifact or commit workflow if desired; FixMap does not do this itself.
This candidate documentation is not a claim that the current npm package or
stable Action tag already exposes the mode.
