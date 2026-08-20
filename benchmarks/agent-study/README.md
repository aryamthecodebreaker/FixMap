# Controlled agent-study artifacts

This directory defines study structure, not study results.

- `protocol.json` freezes the four arms, enforced requirements, metrics, aggregation policy, and
  the path to the task manifest.
- `tasks.json` freezes the complete task universe for `fixmap-navigation-heldout-v1`.

## Task-manifest schema

Top-level fields:

| Field | Contract |
| --- | --- |
| `manifestVersion` | `1` |
| `protocolVersion` | Must equal `protocol.json` (`3`) |
| `studyId` | Non-empty stable study identity required in every run row |
| `status` | Must be `frozen` |
| `frozenAt` | Date on which task membership and text stopped changing |
| `taskSelection` | Source, deterministic inclusion rule, and pre-outcome rationale |
| `tasks` | Non-empty array with unique `taskId` values |

Every task requires `taskId`, exact `taskText`, its lowercase hexadecimal `taskTextSha256`, public
`repository`, exact 40-character `revision`, `sourceIssue`, and `selectionRationale`. The evaluator
recalculates every manifest task hash before it accepts the protocol.

## Publication boundary

The evaluator has no partial-results mode. With no `--input`, it validates only the protocol and
manifest and explicitly claims no result. With `--input`, it requires one global `--model`,
`--model-version`, and `--fixmap-revision`, verifies the exact manifest task × protocol arm
cross-product and transcript bytes, and emits an aggregate only when the whole group passes.
Every row also needs a unique declared `contextId`; this prevents accidental context-ID reuse but
does not prove process isolation.

Separate models require separate complete run files and evaluator invocations. The evaluator does
not pool model groups. Failed and timed-out runs remain in their arm totals and all-run outcome
rate denominators.
