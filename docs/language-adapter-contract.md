# Custom language adapters: implementation contract

Status: implementation design; custom registration is not shipped.

## Existing integration points

- `repo-scan.ts` uses `SOURCE_FILE_EXTENSIONS` and `isLanguageTestPath` to classify
  files. Registering an extractor alone cannot make a new extension usable.
- `plan.ts` passes the scanned snapshot to `report.ts`. Both normal and hybrid
  reports must use the same adapter selection.
- `grounding.ts`, `rank.ts`, `retrieval.ts`, and `import-graph.ts` independently
  request definitions; `impact.ts` constructs its own import graph. A registry
  supplied only to one call produces inconsistent evidence.
- `resolveLanguageImport` currently falls through to JavaScript resolution after
  the seven other built-in cases. Custom identities must never take this fallback.
- Scan caches persist file classification. Adapter identity/version must therefore
  participate in cache compatibility, not only the in-memory fact-cache key.

## Chosen boundaries

Use an explicit immutable registry per analysis, with the default built-in registry
when none is supplied. Do not add process-global registration, environment-driven
module loading, implicit package installation, or executable repository config.
Two concurrent analyses with different registries must remain independent.

Registration is a trusted host-code API. Catching exceptions and validating
results does not sandbox JavaScript, prevent network/filesystem access, or interrupt
an infinite synchronous loop. Document this boundary prominently. Untrusted plugin
execution requires a separately designed isolated worker/process contract and is
not an implied property of registration.

Custom IDs are namespaced separately from built-in IDs. Require an explicit adapter
version, bounded canonical extension list, and supported contract version. Reject
duplicate IDs, case-normalized extension collisions (including built-ins), invalid
extensions, and duplicate registrations before invoking callbacks. Copy and freeze
registry metadata. Registration order must not choose the winning implementation.

## Data flow

1. The host constructs and validates a registry explicitly.
2. Scan classification uses that registry and preserves the usual byte, file-count,
   exclusion, symlink, binary, and containment limits. Registry metadata becomes a
   deterministic part of classification cache compatibility.
3. One analysis-scoped extraction context owns fact caches, selected adapters, and
   bounded diagnostics. Pass it explicitly through report, grounding, retrieval,
   ranking, import graph, and impact paths; standalone public functions retain their
   default built-in behavior. Do not associate registries invisibly with mutable
   files in a process-global WeakMap.
4. Validate callback results before use: array and count bounds, string bounds,
   supported definition kinds, integer UTF-16 offsets within the supplied sample,
   boolean test classification, and matching provenance. Reject invalid batches
   with a stable diagnostic rather than silently using partial malformed facts.
5. Custom resolution receives immutable, repository-relative candidate metadata
   and extracted import facts. Core checks returned targets against the exact
   scanned/excluded snapshot, deduplicates, and applies existing edge limits.
   Unknown/custom IDs cannot enter the JavaScript resolver implicitly. Missing or
   ambiguous targets remain unresolved; no fabricated paths or name equivalence.
6. Exceptions become bounded adapter-ID/path diagnostics, without raw exception
   text or source snippets. Other languages continue. Failed extraction must remain
   distinguishable from a valid empty result throughout uncertainty reporting.
7. Reports carry serializable adapter identity/version provenance, never callbacks.
   Existing reports remain valid; validate additive fields before consumption.

Test-layout classification is not permission to invent a test command. Continue
to require declared runner/manifest evidence. Do not execute scanned code.

## Acceptance gates

- Registry validation rejects ID/extension conflicts without calling any adapter.
- A custom-extension real Git fixture reaches source classification, exact symbol
  grounding, fix-site ranking, import impact, and test-file classification through
  `buildFixMapAnalysis`, not merely direct extractor tests.
- Structural and hybrid paths agree on custom facts and provenance.
- Two concurrent registries using the same extension produce their own facts; a
  default analysis remains byte-for-byte equivalent to the built-in baseline.
- Fresh, warm, edited, and version-changed scans agree with fresh extraction;
  registration changes cannot reuse stale `isSource`/`isTest` classification.
- Throwing, malformed, oversized, forged-provenance, and escaping-target adapters
  produce diagnostics and no unsupported graph edges. Healthy files still rank.
- Consumer mutation cannot alter registry metadata, inputs, or cached facts.
- Packed Core consumers can construct and use the API. Browser-safe paths do not
  acquire Node-only imports. CLI/MCP/Action do not silently load repository plugins;
  document which hosts support explicit registration.
- Full existing tests, report compatibility, generated Action freshness, and
  cross-platform CI pass before marking the capability implemented.

Implementation order: registry validation and scoped extraction context, then
scanner/cache plumbing, then shared analysis/resolution integration, then real
consumer and failure-path acceptance. Keep the roadmap row in progress until all
these paths are connected and verified.
