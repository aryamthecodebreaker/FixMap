# Outcomes and change dossiers (preview)

Preview: these commands may change before v0.10.0.

FixMap can save two kinds of local record after a change is done. Both live inside the
repository, one JSON file per record, and nothing leaves the machine.

| Record | Directory | Command | MCP (read-only) |
| --- | --- | --- | --- |
| Outcome | `.fixmap/outcomes/` | `fixmap outcome record\|list\|show\|remove\|calibrate\|prune` | `fixmap_outcomes` (list, show, calibrate) |
| Change dossier | `.fixmap/dossiers/` | `fixmap dossier create\|list\|show\|remove` | `fixmap_dossier` (list, show) |

## Outcomes

An outcome record keeps what a saved plan predicted (`contextFiles`) next to the paths that were
actually edited, the commands that ran, and who judged the task.

```sh
fixmap plan --issue "Fix login redirect" --format json --output plan.json
# ... make the change ...
fixmap outcome record --report plan.json --working-tree \
  --command-result test-result.json --assessment agent --status succeeded
fixmap outcome calibrate
```

- `--diff <spec>` or `--working-tree [--include-untracked]` is required: it is where the edited paths come from.
- `--command-result <file>` (repeatable) takes one object or an array. Each entry is either a
  `fixmap sandbox` result or `{ "command", "status", "evidence"?, "relatedPaths"? }` with status
  `passed`, `failed`, `timeout`, `crashed`, or `unavailable`.
- `--assessment human|agent|external|unassessed` and `--status succeeded|failed|partial|unknown`
  record who judged the task. A passing command is never treated as task success.

`fixmap outcome calibrate` reports precision (predicted paths that were edited), recall (edited
paths that were predicted), misses, false positives, and command and assessment counts across every
stored record. It is a report. Ranking weights never change automatically, and the output always
says `automaticWeightChanges: false`.

## Change dossiers

```sh
fixmap dossier create --report plan.json --task "Fix login redirect" \
  --diff main...HEAD --pr https://github.com/owner/repo/pull/12 --commit <sha>
```

A dossier links the request text and its SHA-256, the report and Impact Graph fingerprints, the
report's ADR references, the diff's changed paths, command results, and commit/PR identifiers.
The record carries a content fingerprint; a hand-edited file fails validation and is reported.

## Privacy: `--redact`

`--redact` stores `sha256:<hex>` in place of free text:

- `outcome record`: the assessment reason and each command's evidence.
- `dossier create`: the task text (`request.summary`).

Paths, commands, and fingerprints are kept, since calibration needs them. Outcome records never
store task text; the task id defaults to `plan-<first 16 hex of the report's SHA-256>` unless you
pass `--task-id`.

## Retention: `prune`

```sh
fixmap outcome prune --older-than 90
```

deletes outcome records recorded more than 90 days ago. Malformed files are listed, never deleted.
`fixmap outcome remove <id>` and `fixmap dossier remove <id>` delete a single record.

## Safety and recovery

- Writes go to a temp file and are renamed into place, so a reader never sees half a record.
- `.fixmap`, `.fixmap/outcomes`, and `.fixmap/dossiers` must be real directories: links and
  junctions are refused. Record files and locks must be regular files with one link.
- Record ids are letters, digits, `.`, `_`, and `-` only, so an id cannot name a path outside the store.
- Writers take `.fixmap/outcomes.lock` or `.fixmap/dossiers.lock`. A second writer waits about a
  second, then stops. FixMap never takes over a lock, however old: if a writer was interrupted,
  confirm no FixMap process is running, then delete the lock file by hand.
- `list` and `calibrate` report unreadable or invalid files under "Unreadable stored files" (or
  `problems` in JSON) and keep going.
- Decide whether to commit these directories. They are plain JSON and reviewable; add them to
  `.gitignore` if they should stay on one machine.
