# FixMap differential agent study

FixMap 0.9 includes a frozen, machine-checked four-arm protocol. It does **not** publish an
effectiveness percentage until complete raw runs exist for every task and arm.

The arms are:

1. Baseline agent with ordinary repository tools.
2. FixMap available, with no instruction requiring its use.
3. FixMap explicitly instructed before exploration and Verify after editing.
4. The same instructed workflow with the 0.9 Impact Graph and compact agent output.

Every paired task must use the same model and model version, task text, repository revision,
timeout, and budget. Each run starts with fresh context, arm order is randomized, FixMap is
frozen during the study, and the raw transcript is retained. The primary navigation metric is
tool calls to the first relevant file, not turns to the first edit.

Validate the protocol without claiming a result:

```bash
npm run study:agent:check
```

When paid or externally metered runs have been authorized and collected, store one JSON object
per line outside the repository and evaluate it explicitly:

```bash
node scripts/evaluate-agent-study.mjs --input path/to/runs.jsonl
```

Run data is deliberately not checked in by default: transcripts can contain source, prompts,
and account metadata. Any public study must use consented, reviewed, redacted artifacts and link
the exact model/version and frozen task-selection record.
