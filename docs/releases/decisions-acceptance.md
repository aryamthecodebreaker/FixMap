# ADR/rationale ingestion acceptance

Status: implemented for the documented local ingestion contract. Not a release authorization.

Final acceptance: implementation `0a9d6ab` passed CI `34805930550`, including all
four named rationale process checks, and external evaluation `34805930587`.
Two additional documents frozen in `181bfed` pass full reviewed field comparisons
without parser changes. They are new documents in the same repository/convention,
not broad independent-repository validation. See `validation-results.json`.
The checkpoints below retain the development history, including prior failures;
their pending wording describes those historical checkpoints, not current status.

Broad local checkpoint: full Core suite passes 810 tests with one skipped across
72 files. Frozen `adr/madr` cohort (`benchmarks/decisions/cases.json`, selected in
commit `e4d9d3d` before source reads) initially parsed 4/4 documents unchanged.
Field checks now compare title, context, decision, status, and absent date/consequences
against all four authored sources. Review exposed discarded `on hold` wording;
the parser now preserves it in `authoredStatus` separately from normalized status.
All four field comparisons pass after that repair, making this development evidence,
not untouched validation. The second convention is recorded below.
Reproduce with `node scripts/evaluate-decisions.mjs` after a Core
build; this development evaluator explicitly reads GitHub through `gh`.

## Implemented and locally exercised

- Repository-owned ADR/decision/RFC/design discovery with complete-source fingerprints.
- Authored context, decision, consequences, status, date, explicit targets, and supersession references.
- Fenced headings ignored structurally; nested decision subsections preserved.
- Malformed documents isolated with diagnostics, without echoing rejected contents.
- Relevant path and literal term selection; no identifier substring matches.
- Local PR JSON title/body/URL ingestion without generated prose or inferred acceptance.
- Explicitly unverified PR attribution in JSON, Markdown, and agent rendering.
- Additive report validation rejects claimed verified attribution.
- Workspace rationale and mention edges kept distinct from dependencies.
- Existing repository-local file/service/contract/symbol identity resolution, with source-based invalidation and unresolved-target diagnostics.
- Real Git scan-to-report test preserves source bytes and validates JSON output.
- Actual CLI, bundled Action, and MCP processes agree on ADR and PR records;
  unrelated tasks omit them and malformed exports retain diagnostics. Reproduce
  after Core/CLI/Action builds with `node scripts/check-decision-surfaces.mjs`.
- Actual scans refresh edited source fingerprints and remove excluded/deleted
  rationale. The exclusion probe first failed and led to filtering the decision
  inventory through the report's effective exclusions.

## Remaining acceptance work

Second convention checkpoint: three frozen `npryce/adr-tools` documents initially
parsed but failed all field checks because title-adjacent dates were omitted.
After adding that specific convention, all three field checks pass. The original
failure is retained in `benchmarks/decisions/nygard-results.json`; reproduce with
`node scripts/evaluate-decisions.mjs --nygard`. Both cohorts are now development
evidence and must not be described as untouched validation.

Consumer audit checkpoint: editor file responses retain complete decision objects.
Ask evidence, Verify narration, reverse-documentation prose, and change-scope
Markdown now retain unverified PR attribution; 43 focused consumer tests pass,
including an explicit Ask attribution regression. Context packs now select
relevant rationale within the existing source-token budget, retain attribution
in snippet metadata, and omit mismatched source fingerprints with an explicit
`stale-decision-source` reason. The focused Context/Ask/editor group passes 27 tests.
Consumer-specific provenance regressions now cover the remaining text outputs
and editor objects. A final boundary check also aligned reverse-documentation
supersession references with authored ADR references and rejects malformed PR
source metadata rather than accepting an unvalidated attribution.

1. Verify clean cross-platform CI for the final checkpoint, including the new
   real CLI/Action/MCP job step; retain any failures rather than assuming parity.

Latest checkpoint: authored status now reaches Ask, Context metadata, report/agent
text, Verify narration, reverse-documentation drafts, and change-scope Markdown.
The real CLI/Action/MCP fixture also asserts that `on hold` remains authored text
alongside normalized `unknown`. That fixture passes locally and is wired into
the compatibility matrix. The fresh full Core run passed 812 tests with one
skipped. Subsequently added consumer assertions pass in 37 tests across Verify,
change-scope, reverse-docs, and editor protocol; these specifically check original
status text and the unverified source URL/caveat. Cross-platform results remain
pending for the final follow-up, so the capability is not yet promoted. The
implementation checkpoint `8dece92` passed CI run `34805572476`, including the
named rationale process step on Node 20/22 Linux and Node 24 Windows/macOS;
external evaluation run `34805572497` also passed.

## Honest boundaries

No remote fetch, LLM, account, or inferred approval is required. Local attribution
does not verify remote authorship or remote contents. Graph matching does not
invent a service/symbol identity from a display label. Automatic discovery of all
possible language symbols belongs to the language/identity roadmap, not a claim
made by this parser. Unsupported document conventions must be diagnosed and
documented; the supported set must be evaluated before this row is complete.
