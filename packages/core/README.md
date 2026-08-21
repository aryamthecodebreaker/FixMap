# @aryam/fixmap-core

Core repository scanner, ranker, and report renderer for [FixMap](https://github.com/aryamthecodebreaker/FixMap). Zero dependencies.

Most users want the CLI and MCP server instead: [`@aryam/fixmap`](https://www.npmjs.com/package/@aryam/fixmap).

## Usage

```ts
import {
  buildContextPack,
  buildFixMapGraph,
  buildFixMapReport,
  renderAgentReport,
  renderContextPackMarkdown,
  renderFixMapGraphMermaid,
  renderMarkdownReport,
  scanRepo
} from "@aryam/fixmap-core";

const report = await buildFixMapReport({
  repoRoot: "/path/to/repo",
  issueText: "password reset emails fail"
});

console.log(renderMarkdownReport(report));
console.log(renderAgentReport(report));

const repo = await scanRepo({ repoRoot: "/path/to/repo", includeHistory: true });
console.log(renderContextPackMarkdown(buildContextPack({ report, repo, task: "password reset emails fail", budgetTokens: 10_000 })));
console.log(renderFixMapGraphMermaid(buildFixMapGraph(report)));
```

`buildFixMapReport` runs the full pipeline: scan the repository, resolve exclusions, rank primary context against the task, build a separate likely-impact view, route to relevant test commands, and collect risk notes and diagnostics. Impact evidence includes imports, reverse dependents, routed tests, and repeated bounded Git co-change relationships; it is explicitly an inspection aid rather than a claim that every related file must change. Exact git states can reuse a seven-day scan cache, while `useCache: false` forces a fresh scan and reports the bypass.

The package also exports the lower-level scanner, excluder, ranker, BM25 retriever, grounding, import graph, Context Pack and Impact Graph builders, test routing, risk, comparison, explanation, verification, structural validation, and Markdown/JSON/agent/Mermaid rendering APIs. Context budgets use the deterministic estimate `ceil(UTF-8 bytes / 4)` for source and report sample truncation explicitly.

The v0.10 graph API exposes `createGraphIdentity`, explicit `createGraphEquivalence` relationships, deterministic `buildIdentityGraph` snapshots, `buildGraphDependencyIndex`, and `invalidateIdentityGraph`. Identities cover repository, service, package, module, file, symbol, contract, runtime component, and deployment. `buildWorkspaceMap` uses exact `RepoFile.contentFingerprint` values to link Node, Python, and Maven repositories without guessing that similarly named entities are equivalent. `@aryam/fixmap-core/browser` exposes these filesystem-free workspace and identity primitives alongside report, Context Pack, Impact Graph, Compare, Explain, Verify, validation, and rendering logic for browser applications.

Contract Guardian starts with `inventoryContracts` and `compareContractInventories`: it normalizes OpenAPI, AsyncAPI, GraphQL, Protobuf, JSON Schema, and SQL migrations into deterministic compatibility entries, retains exact before/after fingerprints, and can emit owned contract nodes through `contractGraphNodes`. Findings distinguish compatible, breaking, and unknown changes; incomplete scanner content is diagnosed instead of treated as an absent contract.

Human intent is represented by versioned annotations and authored decision records. `inventoryDecisionRecords` preserves ADR/RFC/design Context, Decision, Consequences, status, date, supersession, explicit scopes, and exact source fingerprints; `selectDecisionRecords` attaches only relevant records. Literal path mentions count only when that path exists in the scanned snapshot, and FixMap never rewrites generated prose as the author’s rationale.

Architecture policy is repository-owned in `.fixmap/policy.json`. `architecturePolicyFromRepo` and `evaluateArchitecturePolicy` apply bounded version-1 dependency boundaries, required test changes, reviewer routing, and breaking-contract constraints while retaining the exact policy fingerprint. `buildArchitectureSnapshot` and `compareArchitectureSnapshots` provide deterministic import edges, cyclic components, boundary violations, coupling, and drift; snapshots fail closed when a scanned file lacks an exact content identity.

Historical graph queries use `scanRepoAtRef`, `buildArchitectureSnapshotAtRef`, and `compareArchitectureRefs`. Refs are first resolved to immutable commit IDs, then exact Git blobs are read in a bounded batch. The API never checks out a ref, moves `HEAD`, or writes into the worktree.

`sensitiveDataFlowEvidenceProvider` is a built-in, network-free evidence provider for approximate credential, token, PII, and payment indicators near logging, network, storage, or analytics sinks. It reports only detector rule IDs, categories, exact file fingerprints, and low-confidence structural relationships—never matched values or source snippets—and explicitly states that its results are not taint analysis or a complete security proof.

Supply-chain data enters through `validateSupplyChainEvidenceBundle` and `createSupplyChainEvidenceProvider`. The versioned normalization contract retains external scanner/SBOM tool version, database version, timestamp, document SHA-256, package identity, confidence, advisory/fix data, and license policy. FixMap validates and relates those records but does not ship a CVE database or infer whether a package version or license is safe.

`detectChangeConflicts` compares explicit concurrent change intents on stable graph identities. It distinguishes intended edits, impact zones, contract zones, and graph baselines; reports edit/edit, directional edit/impact, shared-contract, and stale-baseline conflicts with evidence; and leaves unrelated identities alone. Display labels never establish sameness. Only explicit reviewed alias/equivalence edges in an identity graph canonicalize two zones.

`buildMigrationPlan` validates explicit migration steps against one exact identity-graph snapshot and produces dependency-ordered phases. Each step must name intended edits, impacts, contracts, a compatibility strategy (with exit criteria when a window exists), verification commands with reasons, and rollback triggers/actions. Every phase reports its blast radius; cycles, unknown identities, missing safety fields, and undeclared parallel edit/contract overlap fail closed.

`comparePlanAlternatives` requires every candidate to use the same exact graph fingerprint, then compares separate edit, impact, contract, policy, test-coverage, reversibility, and uncertainty axes. The output retains evidence and a non-dominated frontier. It intentionally has no winner field or scalar score: genuine tradeoffs remain visible instead of being hidden behind arbitrary weights.

Outcome feedback uses `OutcomeRecord` and the pure `addOutcomeRecord`, `removeOutcomeRecord`, and `summarizeOutcomeCalibration` APIs. Predictions, actual edits, command outcomes, and separately sourced task assessment remain distinct. Calibration exposes correct predictions, false positives, misses, precision/recall, and per-record evidence; it always declares `automaticWeightChanges: false` and never rewrites ranking weights.

`buildChangeDossier` creates one versioned lifecycle artifact linking request provenance, assumptions and their evidence status, plan/report and graph fingerprints, decision records, diff state, command outcomes, runtime observations/inferences, reviews, and optional release identifiers. It is valid before a diff or release exists, normalizes paths/timestamps, requires evidence for completed claims, and detects content that no longer matches its dossier fingerprint.

`routeReviewers` combines the highest-precedence CODEOWNERS file (with last matching rule semantics), active annotation owners, architecture-policy review rules, and bounded Git author history. Every suggestion keeps source fingerprints, paths and CODEOWNERS lines, confidence, and `availabilityInferred: false`. Historical authorship is low-confidence routing evidence only; FixMap never infers current employment or availability.

The Node entry point exports `buildSandboxInvocation` and `runSandbox` for explicitly consented execution of one exact declared command. Images must already exist locally and be pinned by SHA-256 digest. Docker runs in the local default context with pulls disabled, network off by default, source and root filesystem read-only, non-root user, dropped capabilities, no-new-privileges, IPC isolation, bounded tmpfs/CPU/memory/PIDs/time/output, and no inherited container environment. Results distinguish pass, fail, timeout, crash/output-limit, and unavailable; browser builds do not expose the Node/Docker runner.

Historical CI evidence is normalized by `validateTestHistoryBundle`, classified by `analyzeTestReliability`, and joined to declared `TestRoute` paths by `assessReliableCoverage`. Same-commit and same-environment disagreement is kept distinct from failures across code revisions; skips, quarantine, feature gates, and newest failures stay explicit. Reliable-running status requires at least five clean passes across two commits and every test identity sharing a declared path to qualify. The result retains exact external provenance and never claims test correctness or future stability.

`selectCIMatrix` chooses among caller-declared CI jobs without inventing commands or claiming that a job exercises an environment. OS, runtime, database, browser, feature-flag, and deployment requirements retain affected paths and exact repository/history/policy/runtime evidence; each candidate needs separate evidence for every coverage claim. Deterministic greedy set cover reduces the declared matrix, preserves all justifications, and reports uncovered requirements, omitted candidates, and `minimalityClaimed: false`.

`proposeCharacterizationTests` turns redaction-reviewed sandbox, trace, CI, or manual observations into deterministic structured arrange/act/assert drafts. Each proposal retains source and observation provenance, distinguishes a single observation from repeated multi-environment behavior, and says it preserves what was observed rather than what is correct. Drafts always require review and explicitly authorize neither execution nor commit; `renderCharacterizationProposalMarkdown` makes those boundaries visible in review output.

`mapRuntimeEvidence` normalizes redaction-reviewed OpenTelemetry/APM trace and Speedscope/pprof profile evidence onto exact repository file identities. A mapping requires both an explicit repository ID and repository-relative code path; names and symbols are never identity guesses. Span latency stays separate from profile self-sample share, all unmapped records retain their reason, and the output explicitly makes no CPU-time, wall-clock-time, or causal-impact claim.

`rankIncidentSuspects` combines bounded deployment timing, exact changed-file revisions, eligible error locations, mapped runtime locations, and repository-scoped impact links for regression triage. Each transparent rule contributes at most once per suspect so exporter volume cannot inflate rank; observations and inferences stay labeled with all evidence fingerprints and references. Old/future deployments and unresolved runtime records remain visible, and every result hard-codes that causality is not established.

Editor integrations share `createEditorProtocolSnapshot` and `handleEditorProtocolRequest` rather than reinterpreting reports independently. The v1 snapshot is a deep-frozen, content-fingerprinted projection of one explicit `reportVersion: 1`; local-only capabilities, plan, file, and annotation methods return stable errors and repeat the snapshot fingerprint. File views join context, impact, tests, annotations, authored decisions, policy, and clearly labeled repository risks without source upload or mutation.

`answerFixMapQuestion` provides a deterministic no-model path for structural plan, impact, test, risk, and authored-rationale questions using a bounded `buildAskEvidence` pack. An optional provider sees report evidence rather than source content, must cite only supplied IDs and expose unknowns, and falls back safely on invalid or failed output. Remote providers require explicit consent before receiving evidence; provider locality remains a caller-declared claim, and model text is never marked independently verified.

Verify includes a structured impact narrative: each sentence is labeled as an observation or inference and carries machine-readable evidence for changed files, structural or historical impact, routed tests, risk rules, annotations, decision records, and architecture policy. Markdown explains the risk; JSON preserves the proof.

JSON reports use `reportVersion: 1`. Additive fields and diagnostic codes may appear within that version; consumers should ignore unknown fields and use diagnostic severity as the stable fallback.

MIT © FixMap contributors.
