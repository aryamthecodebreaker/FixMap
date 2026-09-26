import { describe, expect, it } from "vitest";
import { assessEnterpriseRetention, authorizeEnterpriseAction, createEnterpriseAuditEvent, verifyEnterpriseAuditChain, type EnterpriseAuthorizationRequest, type EnterprisePolicy } from "../src/enterprise-policy.js";

const policy = (): EnterprisePolicy => ({ enterprisePolicyVersion: 1, tenantId: "tenant-a", sourceFingerprint: "sha256:policy1234",
  roles: [{ role: "developer", grants: [{ resource: "repository", actions: ["read"] }, { resource: "runtime-evidence", actions: ["read", "create"] }] }],
  retentionDays: { report: 30, "audit-event": 365 } });
const request = (): EnterpriseAuthorizationRequest => ({ requestId: "req-1", requestedAt: "2026-08-21T10:00:00Z",
  actor: { subjectId: "user-1", tenantId: "tenant-a", roles: ["developer"] },
  authentication: { issuer: "https://id.example", audience: "fixmap", credentialFingerprint: "sha256:credential1234",
    authenticatedAt: "2026-08-21T09:00:00Z", expiresAt: "2026-08-21T11:00:00Z" },
  action: "read", resource: { tenantId: "tenant-a", kind: "repository", id: "repo-1" } });

describe("enterprise policy", () => {
  it("allows only a same-tenant role grant and does not claim credential verification", () => {
    expect(authorizeEnterpriseAction(policy(), request())).toMatchObject({ allowed: true, reason: "allowed-by-role",
      matchedRoles: ["developer"], authenticationVerifiedByFixMap: false });
    expect(authorizeEnterpriseAction(policy(), { ...request(), action: "delete" })).toMatchObject({ allowed: false, reason: "role-not-granted" });
  });

  it("enforces tenant boundaries before role grants", () => {
    const crossTenant = request();
    crossTenant.resource.tenantId = "tenant-b";
    expect(authorizeEnterpriseAction(policy(), crossTenant)).toMatchObject({ allowed: false, reason: "tenant-boundary", matchedRoles: [] });
    const wrongPolicy = request();
    wrongPolicy.actor.tenantId = "tenant-b";
    wrongPolicy.resource.tenantId = "tenant-b";
    expect(authorizeEnterpriseAction(policy(), wrongPolicy).reason).toBe("policy-tenant-mismatch");
  });

  it("denies expired or not-yet-valid authentication attestations", () => {
    expect(authorizeEnterpriseAction(policy(), { ...request(), requestedAt: "2026-08-21T12:00:00Z" }).reason).toBe("authentication-expired");
    expect(authorizeEnterpriseAction(policy(), { ...request(), requestedAt: "2026-08-21T11:00:00Z" }).reason).toBe("authentication-expired");
    expect(authorizeEnterpriseAction(policy(), { ...request(), requestedAt: "2026-08-21T08:00:00Z" }).reason).toBe("authentication-not-yet-valid");
  });

  it("builds an ordered SHA-256 audit chain and detects tampering", async () => {
    const decision = authorizeEnterpriseAction(policy(), request());
    const first = await createEnterpriseAuditEvent({ decision, occurredAt: "2026-08-21T10:01:00Z", outcome: "succeeded", outcomeReference: "report-1" });
    const second = await createEnterpriseAuditEvent({ decision, occurredAt: "2026-08-21T10:02:00Z", outcome: "failed", previousEventFingerprint: first.eventFingerprint });
    expect(first.eventFingerprint).toMatch(/^audit:sha256:[a-f0-9]{64}$/);
    expect(await verifyEnterpriseAuditChain([first, second])).toMatchObject({ valid: true, invalidIndex: null });
    expect(await verifyEnterpriseAuditChain([first, { ...second, outcomeReference: "changed" }])).toMatchObject({ valid: false, invalidIndex: 1 });
    await expect(createEnterpriseAuditEvent({ decision: { ...decision, allowed: false }, occurredAt: "2026-08-21T10:01:00Z", outcome: "succeeded" })).rejects.toThrow("audit event");
    const reversedTime = await createEnterpriseAuditEvent({ decision, occurredAt: "2026-08-21T10:00:30Z", outcome: "succeeded", previousEventFingerprint: first.eventFingerprint });
    expect(await verifyEnterpriseAuditChain([first, reversedTime])).toMatchObject({ valid: false, invalidIndex: 1 });
  });

  it("assesses retention without deleting and honors legal holds", () => {
    expect(assessEnterpriseRetention(policy(), { tenantId: "tenant-a", kind: "report", createdAt: "2026-01-01", asOf: "2026-02-01", legalHold: false }))
      .toMatchObject({ decision: "deletion-eligible", reason: "retention-window-expired", automaticDeletion: false });
    expect(assessEnterpriseRetention(policy(), { tenantId: "tenant-a", kind: "report", createdAt: "2026-01-01", asOf: "2026-12-01", legalHold: true }))
      .toEqual({ decision: "retain", reason: "legal-hold", expiresAt: null, automaticDeletion: false });
    expect(assessEnterpriseRetention(policy(), { tenantId: "tenant-a", kind: "dossier", createdAt: "2026-01-01", asOf: "2026-12-01", legalHold: false }).reason)
      .toBe("retention-not-configured");
  });

  it("rejects malformed policies and requests", () => {
    expect(() => authorizeEnterpriseAction({ ...policy(), roles: [...policy().roles, policy().roles[0]] }, request())).toThrow("Duplicate enterprise role");
    expect(() => assessEnterpriseRetention({ ...policy(), retentionDays: { report: 0 } }, {
      tenantId: "tenant-a", kind: "report", createdAt: "2026-01-01", asOf: "2026-02-01", legalHold: false
    })).toThrow("Invalid retention period");
    expect(() => authorizeEnterpriseAction(policy(), { ...request(), authentication: { ...request().authentication,
      expiresAt: "2026-08-21T08:00:00Z" } })).toThrow("authorization request");
  });
});
