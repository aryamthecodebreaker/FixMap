# ADR/rationale ingestion acceptance

Status: in progress. This is a completion checklist, not a new feature roadmap.

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

1. Exercise documented ADR conventions against frozen real repository documents;
   retain unsupported cases and diagnostics instead of silently replacing fixtures.
2. Check report/context/editor consumers for preservation of authored rationale and
   explicit unverified attribution; document any consumer-specific bounds.
3. Run full relevant suites and the clean cross-platform CI for the final checkpoint.

## Honest boundaries

No remote fetch, LLM, account, or inferred approval is required. Local attribution
does not verify remote authorship or remote contents. Graph matching does not
invent a service/symbol identity from a display label. Automatic discovery of all
possible language symbols belongs to the language/identity roadmap, not a claim
made by this parser. Unsupported document conventions must be diagnosed and
documented; the supported set must be evaluated before this row is complete.
