# Evidence-provider SDK (candidate API)

The v0.10 candidate exports `collectEvidence` and its TypeScript types from
`@aryam/fixmap-core`. This API collects evidence from **trusted in-process code**.
It is not a plugin sandbox, subprocess runner, or automatic CLI plugin loader.
Calling it does not automatically attach its output to a Plan or Verify report.

## Minimal local provider

```ts
import { collectEvidence, type EvidenceProvider, type RepoMap } from '@aryam/fixmap-core';

const provider: EvidenceProvider = {
  id: 'team-file-inventory',
  version: '1.0.0',
  capabilities: { network: 'never', executesCode: false },
  collect({ repo }) {
    return {
      items: repo.files.map((file, index) => ({
        id: `file-${index}`,
        kind: 'structure',
        summary: `Scanner observed ${file.path}`,
        confidence: 'high',
        subjects: [{ kind: 'file', path: file.path }]
      }))
    };
  }
};

export async function inventory(repo: RepoMap) {
  return collectEvidence([provider], { repo, issueText: '', diffText: '' }, {
    now: '2026-09-11T00:00:00Z',
    allowNetwork: false,
    allowCodeExecution: false
  });
}
```

For durable items, use a stable provider-local identity derived from the subject,
not this example's array index. Keep source fingerprints in scalar `metadata`
when evidence needs stale-source detection; the collector does not invent them.

## Contract and provenance

- Provider IDs match `[a-z0-9][a-z0-9._-]{0,63}`; versions must be nonblank.
- Each item has a provider-local ID, kind, nonblank summary (at most 1,000
  characters), confidence, and 1–100 typed subjects. File paths cannot escape
  the repository. Confidence is the provider's claim, not a verified probability.
- Optional relationships reference item IDs from the same provider result.
  Missing endpoints and duplicate item or relationship IDs reject that result.
- Returned IDs are namespaced as `provider-id:local-id`. Items and relationships
  carry the provider ID/version and are sorted by namespaced ID. Provider output
  is cloned, so later output mutation cannot rewrite the collected evidence.
- Supply `now` explicitly for reproducibility. Otherwise collection uses wall-clock
  time. Providers must themselves avoid nondeterministic ambient inputs.
- Inspect `diagnostics`; an empty item list does not prove absence of a problem.

## Bounds and trust

Defaults are 5,000 retained items, 10,000 retained relationships per provider,
and a 30-second asynchronous timeout. Set `maxItemsPerProvider`,
`maxRelationshipsPerProvider`, and `timeoutMs` to positive safe integers to
override them. Truncation is diagnosed; relationships whose endpoints were
omitted are dropped. Results are validated before retention bounds are applied,
so these settings are **not input-memory limits** for hostile output.

A provider declaring required network access or code execution is skipped unless
the caller explicitly grants it. Optional-network providers receive the exact
grant in `context.permissions.network` and must honor it. These declarations
do not intercept Node APIs. A synchronous loop can block the event loop, and an
asynchronous task can ignore cancellation. Timeout requests cancellation through
`context.signal`; it cannot forcibly terminate in-process code.

Only load code you trust. Do not import arbitrary repository plugins to inspect
a repository. Running untrusted providers requires a separately enforced process
or container boundary and a bounded serialized evidence protocol. That transport
is not supplied by the in-process collector.

## Serialized data import

The Node Core export `parseEvidenceProviderBundle(json)` accepts a versioned
JSON envelope: `{ "bundleVersion": 1, "provider": { "id": "tool", "version": "1" },
"result": { "items": [], "relationships": [] } }`. Pass actual serialized JSON,
not executable provider code. It returns `{ provider, documentSha256 }`; retain
the digest with the collected evidence to identify the exact supplied document.
The producer ID/version are claims, not authenticated signatures.

Input is capped at 1 MiB of UTF-8 before JSON parsing, with at most 5,000 items
and 10,000 relationships before validation/cloning. Invalid envelopes, unsafe
subject paths, duplicate identities and dangling relationships fail closed.
Top-level and provider fields are allowlisted. Returned provider capabilities
are always `network: 'never'` and `executesCode: false`; collection only copies
validated data. Parser errors do not echo input contents.

The parser does not read files, launch producers, upload data, or authenticate
evidence. Node callers can explicitly use `await readEvidenceProviderBundle(path)`
for bounded local-file import. It rejects non-regular paths, checks the opened
descriptor, reads at most the byte cap plus one growth-detection byte, and rejects
invalid UTF-8. Errors do not echo private paths. It does not promise atomic
snapshots of concurrently rewritten files; it rejects detected identity, size,
or timestamp changes, and the digest identifies the bytes read. Metadata checks
are best-effort detection, not a filesystem transaction or producer attestation.
Callers reading subprocess output must enforce byte limits while reading.
Process/container orchestration,
report attachment, and broader workflow acceptance remain unfinished.

## Failure handling

Duplicate provider IDs, invalid output, denied capabilities, failures, and
truncation produce distinct diagnostic codes. A collection failure does not
abort other valid providers. Callers should display the diagnostics, treat
missing evidence as unknown, and redact sensitive provider error messages before
sharing collected output externally.

Focused contract coverage lives in `packages/core/test/evidence.test.ts`.
This documentation alone does not complete the roadmap's Evidence-provider SDK
row: bounded producer transport orchestration and end-to-end acceptance remain required.
