# Authored decision records (v0.10 candidate)

FixMap reads local ADR, decision, RFC, and design documents containing a title
and a Decision, Resolution, or Proposal section. It preserves authored text;
it does not generate a replacement rationale.

To retain attribution when copying rationale from a pull-request description,
save a reviewed local document such as `docs/adr/004-token-boundary.md`:

```markdown
---
status: proposed
fixmap-source-pr: https://github.com/acme/auth/pull/42
fixmap-applies-to: file:src/token.ts
---
# Token boundary
## Context
The provider owns the token format.
## Decision
Treat tokens as opaque.
```

The PR URL is an explicit local attribution, not verified remote provenance.
FixMap does not fetch it, authenticate, verify its author, infer approval, or
check that copied text matches the PR. The local document fingerprint identifies
the bytes actually analyzed. Only canonical public GitHub PR URLs are currently
supported; credentials, query strings, fragments, and non-HTTPS schemes are not.
Alternatively, save a local JSON export under `docs/decisions/` with string
`title`, `body`, and canonical `url` fields. An optional `fixmapAppliesTo` string
uses the same explicit target syntax. The complete body (up to 8,000 characters)
is preserved without requiring Markdown decision headings. Empty bodies are
diagnosed, not substituted. Extra export metadata such as `state: "MERGED"` does
not establish acceptance: imported PR descriptions always have unknown decision
status. This consumes an existing local export; FixMap does not obtain it for you.

Workspace graphs distinguish explicit `rationale-for` edges from literal path
`mentions`. Neither is a code dependency or proof that a decision is enforced.
Named targets resolve against declared repository-local identity keys, not labels.
Path-qualified symbols require matching source provenance. Unresolved targets
produce diagnostics. Broader convention and end-to-end acceptance work remains.

Status parsing recognizes leading explicit labels. Negated labels, substrings
such as `inactive`, and conflicting status history remain `unknown` rather than
being interpreted as approval. Keep the current status separate from historical
discussion when authoring records.
