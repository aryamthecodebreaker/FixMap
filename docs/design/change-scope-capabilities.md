# Deterministic product scope and capability maps

Status: v0.10.0 design contract. Core implementation is incremental; CLI/MCP surfaces are
not considered complete until their own acceptance rows are verified.

## Product boundary

FixMap does not interpret product requirements. It does not decide what "checkout",
"subscriptions", or any other product word means. No LLM, hosted API, account, semantic
model, or network service participates in this workflow.

A person or calling tool supplies explicit repository anchors. FixMap expands only graph
relationships whose provenance it can show. The result distinguishes:

- `declared`: an anchor supplied by the user or a reviewed capability file;
- `observed`: an exact existing repository file, contract, decision, owner rule, or policy;
- `derived`: a bounded structural relationship such as an import, dependent, or routed test;
- `unresolved`: a declared future or misspelled anchor for which no repository evidence exists.

FixMap reports exact counts in those categories. It does not turn them into a made-up
"91% observed" confidence percentage because there is no defensible denominator for all the
unknown implementation evidence that might exist.

## Two interfaces, one Core primitive

`fixmap change-scope` is a one-off question:

```bash
fixmap change-scope \
  --touch src/auth \
  --touch packages/api \
  --add db/migrations
```

`fixmap capability` is a persistent, reviewed product-to-implementation mapping. A versioned
`.fixmap/capabilities.json` names a capability and stores the same explicit anchors and
traversal bounds. Showing a capability reruns the structural expansion against the current
repository; the checked-in file records human intent, not generated conclusions.

```json
{
  "capabilityStoreVersion": 1,
  "workspace": "acme",
  "repository": "commerce-api",
  "capabilities": [
    {
      "id": "checkout",
      "name": "Checkout",
      "anchors": [
        { "operation": "touch", "path": "src/routes/checkout.ts" },
        { "operation": "touch", "path": "packages/payments" }
      ],
      "traversal": { "direction": "both", "maxDepth": 2, "maxNodes": 200 }
    }
  ]
}
```

Persistent capability diffing must compare two exact repository snapshots and retain both
source fingerprints. It must not compare a stale generated cache with a live checkout.

## Expansion rules

1. Paths are normalized repository-relative paths; absolute, empty, traversal, and NUL paths
   are rejected.
2. An exact file anchor selects that file. A directory/prefix anchor selects existing files
   below it in canonical path order.
3. A non-existent `add` anchor remains unresolved. FixMap does not fabricate files, symbols,
   packages, contracts, tests, or owners for it.
4. Expansion follows an allowlisted direction over exact import edges: dependencies,
   dependents, or both. Cycles are visited once.
5. Depth and node limits are mandatory and visible. Omitted nodes are counted; truncation is
   never presented as a complete blast radius.
6. Contracts, ADRs, test routes, reviewers, and architecture findings are joined only from
   existing FixMap evidence providers and retain their source paths/fingerprints.
7. Generated, backup, and FixMap-owned artifacts cannot become scope nodes.
8. Every selected and affected file receives a stable FixMap identity within the explicit
   workspace and repository identity supplied by the caller or capability store.

## Acceptance boundary

The workflow is not release-ready until Core, CLI, MCP, JSON/Markdown output, persistent
store mutation, historical `capability diff`, cross-repository expansion, truncation tests,
and clean-package/cross-platform proof all exist. An initial Core engine does not authorize
advertising the complete command family.
