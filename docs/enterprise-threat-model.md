# FixMap enterprise foundation threat model

This document covers the v0.10 Core policy, audit-envelope, and retention primitives. It does not claim that FixMap currently provides a hosted multi-tenant service.

## Trust boundaries

- Identity authentication happens outside Core. `EnterpriseAuthorizationRequest.authentication` is an attestation supplied by the host. FixMap validates its shape and time window but returns `authenticationVerifiedByFixMap: false`; the host must validate signatures, issuer, audience, revocation, and credential binding.
- Tenant equality is checked before role grants. A role, including one named “admin,” never crosses the policy tenant, actor tenant, or resource tenant boundary.
- Authorization is default-deny. A same-tenant action needs an exact role/resource/action grant.
- Runtime execution remains separately consented and sandboxed. An `execute` grant is necessary host policy evidence, not execution consent by itself.

## Audit integrity

Audit events bind the complete authorization decision, outcome, prior event fingerprint, and monotonic timestamp with SHA-256. This detects accidental mutation or reordering when a trusted chain head is known. It is not a signature and an attacker able to rewrite the entire store can recompute the chain. A service must durably anchor or sign chain heads outside the writable audit store and restrict audit append/read access.

Provider error text, credentials, tokens, and source content should not enter audit references. Hosts must apply their own structured redaction and size limits before calling Core.

## Retention and deletion

Core only returns `retain` or `deletion-eligible`; `automaticDeletion` is always false. The host must enforce legal holds, record deletion authorization and outcome, protect tenant boundaries during deletion, and test backup/replica behavior. No configured retention means retain, not delete.

## Remaining service threats

A persistent service still needs signed-token integration, session and CSRF defenses, rate limiting, encrypted transport/storage, secret management, tenant-scoped database queries and cache keys, SSRF/path traversal defenses, outbound-network controls, audit-head anchoring, backup isolation, incident response, and adversarial integration tests. Helm packaging is intentionally blocked until such a service exists and these controls are testable.
