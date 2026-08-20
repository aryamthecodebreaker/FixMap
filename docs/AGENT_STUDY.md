# FixMap differential agent study

FixMap includes a frozen, machine-checked four-arm protocol. It does **not** publish an
effectiveness percentage until complete raw runs exist for every task and arm.

The arms are:

1. Baseline agent with ordinary repository tools.
2. FixMap available, with no instruction requiring its use.
3. FixMap explicitly instructed before exploration and Verify after editing.
4. The same instructed workflow with the 0.9 Impact Graph and compact agent output.

Every paired task must use the same model and model version, task text, repository revision,
timeout, and budget. Each run starts with fresh context, arm order is randomized, FixMap is
frozen during the study, the task-success rubric and price sheet are recorded before execution,
and the raw transcript is retained. Failed and timed-out runs stay in the dataset. The primary
navigation metric is tool calls to the first relevant file, not turns to the first edit.

Each JSONL row records provider-reported input, cached-input, output, reasoning, and total tokens
when the provider exposes them; model cost in USD under the frozen price sheet; turns; total tool
calls; repository-search calls; files and source bytes read; wall-clock time; correctness; test
selection; and failure status. Unsupported provider counters are `null`, never estimated from
characters or repository size.

The row also pins `taskId`, `taskTextSha256`, `arm`, randomized `runOrder`, model and version,
repository and revision, `environmentId`, `timeoutMs`, `budgetId`, `priceSheetId`, and transcript
reference plus SHA-256. Those controls let the evaluator reject a comparison where more than the
experimental arm changed.

Validate the protocol without claiming a result:

```bash
npm run study:agent:check
```

When paid or externally metered runs have been authorized and collected, store one JSON object
per line outside the repository and evaluate it explicitly:

```bash
node scripts/evaluate-agent-study.mjs --input path/to/runs.jsonl
```

The evaluator rejects incomplete task/arm sets, duplicate runs, invalid metric types, mismatched
models or repository revisions, missing transcript hashes, inconsistent task controls, and
unaccounted failures. Its summary reports quality and efficiency together; a cheaper run is not a
win if task resolution or patch acceptance falls.

Run data is deliberately not checked in by default: transcripts can contain source, prompts,
and account metadata. Any public study must use consented, reviewed, redacted artifacts and link
the exact model/version and frozen task-selection record.
