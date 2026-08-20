# FixMap differential agent study

FixMap includes a frozen, machine-checked four-arm protocol and a frozen task manifest. It
does **not** include controlled agent runs or publish an effectiveness, token, cost, or time
result.

The four arms are:

1. Baseline agent with ordinary repository tools.
2. FixMap available, with no instruction requiring its use.
3. FixMap explicitly instructed before exploration and Verify after editing.
4. The same instructed workflow with the 0.9 Impact Graph and compact agent output.

## Frozen task set

[`benchmarks/agent-study/tasks.json`](../benchmarks/agent-study/tasks.json) is the sole task
manifest for `fixmap-navigation-heldout-v1`. It freezes all 12 public, MIT-licensed issue tasks
from the pre-existing held-out suite at their exact pre-fix repository revisions. The tasks were
selected mechanically before any controlled agent-study outcome existed. A run file cannot add,
remove, rename, or rewrite a task.

Each manifest entry contains:

- `taskId`: stable identity used in run rows;
- `taskText`: exact prompt text;
- `taskTextSha256`: SHA-256 of the UTF-8 task text;
- `repository`: public Git repository URL;
- `revision`: exact 40-character pre-fix Git revision;
- `sourceIssue`: public issue URL;
- `selectionRationale`: why the task belongs in the frozen set.

`npm run study:agent:check` verifies protocol version 3, the manifest schema, task uniqueness,
exact task-text hashes, and pinned revision syntax without evaluating or claiming a result.

## Run contract

Every study group must contain exactly one run for every manifest task and every arm: 12 tasks ×
4 arms = 48 rows. Each row records `studyId`, the exact `taskText` and its hash, arm and randomized
order, repository and revision, environment, unique declared context ID, timeout, budget, task-specific rubric ID, price
sheet, one globally pinned model and model version, one globally pinned FixMap revision,
transcript reference and SHA-256, run status, failure reason, and every declared quality or
efficiency metric.

The transcript reference must be a unique path relative to the JSONL file. It cannot be absolute
or escape the run-data directory. The evaluator reads the referenced bytes and compares their
real SHA-256 with `transcriptSha256`; a syntactically valid but incorrect hash is rejected.

Token counters must use `tokenAccountingSource: "provider-reported"`. Provider-reported input,
cached-input, output, reasoning, and total counters are recorded when exposed. An unsupported
counter is `null`; the evaluator never estimates it from characters, source bytes, other token
counters, or repository size. Model cost may be recorded under the frozen `priceSheetId`.

Failed and timed-out runs remain required rows. They need a non-empty `failureReason`, stay in
each arm's `runs` denominator, and are reported separately as `failedRuns` and `timedOutRuns`.
They are never filtered out to make an arm look better.

## Global model pin

One evaluator invocation is one model study group. Evaluation requires explicit global pins:

```bash
node scripts/evaluate-agent-study.mjs \
  --input path/to/study/runs.jsonl \
  --model exact-model-name \
  --model-version exact-provider-version \
  --fixmap-revision exact-40-character-git-revision
```

Every row must match both model pins. Mixed models or versions are rejected before aggregation. A
multi-model investigation must keep one complete JSONL file and one evaluator output per exact
model/version; those aggregates must be reported separately and cannot be pooled by this tool.
Every row must also match the global FixMap revision, including baseline rows where the tool is
not exposed, so the experimental implementation cannot drift mid-study.

## Publishable aggregate gate

The evaluator emits `publishableAggregate: true` only after all of these checks pass:

- the checked-in protocol and task manifest are valid and frozen;
- the run set contains exactly the 48 required task/arm pairs;
- there are no missing, extra, unknown, or duplicate task/arm runs;
- every row matches the frozen task text, task hash, repository, revision, and study ID;
- every row has a unique declared context ID;
- every task holds environment, timeout, budget, rubric ID, and price sheet constant and assigns each arm a unique order from 1 through 4;
- every row matches the globally pinned model and model version;
- every row matches the globally pinned FixMap revision;
- every transcript exists inside the run-data directory and its bytes match its SHA-256;
- token counters are declared provider-reported and every metric has the required type;
- completed runs have no failure reason, while failed and timed-out runs retain one.

The aggregate reports outcome rates over **all** required runs plus status counts and medians for
available numeric values. `publishableAggregate` means the artifact is structurally complete and
auditable under this protocol. It does not by itself establish causal validity, generalization,
adequate statistical power, unbiased human scoring, or a marketing claim.

## Data handling and authorization

Run data is deliberately not checked in by default: transcripts can contain source, prompts,
tool output, and account metadata. Any public study must use consented, reviewed, redacted
artifacts and publish the exact manifest hash, model/version, FixMap revision, rubric, price
sheet, environment, context IDs, and evaluator output.

Controlled model runs may incur cost. Do not run them without explicit authorization. The
checked-in validation and rejection tests use synthetic local files only and make no model or API
calls.

The evaluator verifies that context IDs are unique and that each task records a complete arm-order
permutation; it cannot prove that the underlying agent processes were actually fresh or that order
assignment was random. Those execution controls still require independent collection records.
