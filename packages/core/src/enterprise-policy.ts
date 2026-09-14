export type EnterpriseAction = "read" | "create" | "update" | "delete" | "execute" | "admin";
export type EnterpriseResourceKind = "repository" | "report" | "annotation" | "dossier" | "runtime-evidence" | "configuration";

export type EnterprisePolicy = {
  enterprisePolicyVersion: 1;
  tenantId: string;
  sourceFingerprint: string;
  roles: Array<{ role: string; grants: Array<{ resource: EnterpriseResourceKind; actions: EnterpriseAction[] }> }>;
  retentionDays: Partial<Record<EnterpriseResourceKind | "audit-event", number>>;
};

export type EnterpriseAuthorizationRequest = {
  requestId: string;
  requestedAt: string;
  actor: { subjectId: string; tenantId: string; roles: string[] };
  authentication: {
    issuer: string;
    audience: string;
    credentialFingerprint: string;
    authenticatedAt: string;
    expiresAt: string;
  };
  action: EnterpriseAction;
  resource: { tenantId: string; kind: EnterpriseResourceKind; id: string };
};

export type EnterpriseAuthorizationDecision = {
  enterpriseAuthorizationVersion: 1;
  request: EnterpriseAuthorizationRequest;
  policyFingerprint: string;
  allowed: boolean;
  reason: "allowed-by-role" | "tenant-boundary" | "policy-tenant-mismatch" | "authentication-expired" | "authentication-not-yet-valid" | "role-not-granted";
  matchedRoles: string[];
  authenticationVerifiedByFixMap: false;
};

export type EnterpriseAuditEvent = {
  enterpriseAuditVersion: 1;
  eventFingerprint: string;
  previousEventFingerprint: string | null;
  occurredAt: string;
  decision: EnterpriseAuthorizationDecision;
  outcome: "succeeded" | "failed" | "denied";
  outcomeReference?: string;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,499}$/;
const FINGERPRINT = /^[A-Za-z][A-Za-z0-9._-]*:[A-Za-z0-9._-]{4,255}$/;
const ACTIONS: EnterpriseAction[] = ["read", "create", "update", "delete", "execute", "admin"];
const RESOURCES: EnterpriseResourceKind[] = ["repository", "report", "annotation", "dossier", "runtime-evidence", "configuration"];

/** Authorization consumes a caller-verified authentication attestation; FixMap never claims to validate the credential itself. */
export function authorizeEnterpriseAction(policyInput: EnterprisePolicy, requestInput: EnterpriseAuthorizationRequest): EnterpriseAuthorizationDecision {
  const policy = validateEnterprisePolicy(policyInput);
  const request = validateAuthorizationRequest(requestInput);
  let reason: EnterpriseAuthorizationDecision["reason"] = "role-not-granted";
  let allowed = false;
  const matchedRoles: string[] = [];
  if (policy.tenantId !== request.actor.tenantId) reason = "policy-tenant-mismatch";
  else if (request.actor.tenantId !== request.resource.tenantId) reason = "tenant-boundary";
  else if (Date.parse(request.requestedAt) >= Date.parse(request.authentication.expiresAt)) reason = "authentication-expired";
  else if (Date.parse(request.requestedAt) < Date.parse(request.authentication.authenticatedAt)) reason = "authentication-not-yet-valid";
  else {
    for (const roleName of request.actor.roles) {
      const role = policy.roles.find((entry) => entry.role === roleName);
      if (role?.grants.some((grant) => grant.resource === request.resource.kind && grant.actions.includes(request.action))) matchedRoles.push(roleName);
    }
    allowed = matchedRoles.length > 0;
    reason = allowed ? "allowed-by-role" : "role-not-granted";
  }
  return {
    enterpriseAuthorizationVersion: 1,
    request,
    policyFingerprint: policy.sourceFingerprint,
    allowed,
    reason,
    matchedRoles: [...new Set(matchedRoles)].sort(),
    authenticationVerifiedByFixMap: false
  };
}

export async function createEnterpriseAuditEvent(input: {
  decision: EnterpriseAuthorizationDecision;
  occurredAt: string;
  outcome: EnterpriseAuditEvent["outcome"];
  outcomeReference?: string;
  previousEventFingerprint?: string;
}): Promise<EnterpriseAuditEvent> {
  if (!validAuthorizationDecision(input.decision) || !validDate(input.occurredAt) ||
    !["succeeded", "failed", "denied"].includes(input.outcome) ||
    (input.decision.allowed === false && input.outcome !== "denied") || (input.decision.allowed === true && input.outcome === "denied") ||
    Date.parse(input.occurredAt) < Date.parse(input.decision.request.requestedAt) ||
    (input.outcomeReference !== undefined && !bounded(input.outcomeReference, 1_000)) ||
    (input.previousEventFingerprint !== undefined && !/^audit:sha256:[a-f0-9]{64}$/.test(input.previousEventFingerprint))) {
    throw new Error("Invalid enterprise audit event input.");
  }
  const content = {
    enterpriseAuditVersion: 1 as const,
    previousEventFingerprint: input.previousEventFingerprint ?? null,
    occurredAt: new Date(input.occurredAt).toISOString(),
    decision: structuredClone(input.decision),
    outcome: input.outcome,
    ...(input.outcomeReference ? { outcomeReference: input.outcomeReference.trim() } : {})
  };
  return { ...content, eventFingerprint: `audit:sha256:${await sha256(canonicalize(content))}` };
}

function validAuthorizationDecision(decision: EnterpriseAuthorizationDecision): boolean {
  if (!decision || decision.enterpriseAuthorizationVersion !== 1 || !fingerprint(decision.policyFingerprint) ||
    decision.authenticationVerifiedByFixMap !== false || !Array.isArray(decision.matchedRoles)) return false;
  try {
    const request = validateAuthorizationRequest(decision.request);
    if (canonicalize(request) !== canonicalize(decision.request)) return false;
  } catch { return false; }
  if (decision.allowed) return decision.reason === "allowed-by-role" && decision.matchedRoles.length > 0;
  return decision.reason !== "allowed-by-role" && decision.matchedRoles.length === 0;
}

export async function verifyEnterpriseAuditChain(events: readonly EnterpriseAuditEvent[]): Promise<{ valid: boolean; invalidIndex: number | null; message: string }> {
  if (!Array.isArray(events) || events.length > 1_000_000) return { valid: false, invalidIndex: null, message: "Invalid audit chain envelope." };
  let previous: string | null = null;
  let previousOccurredAt = -Infinity;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.enterpriseAuditVersion !== 1 || event.previousEventFingerprint !== previous) {
      return { valid: false, invalidIndex: index, message: "Audit chain link does not match the preceding event." };
    }
    if (!validDate(event.occurredAt) || Date.parse(event.occurredAt) < previousOccurredAt) {
      return { valid: false, invalidIndex: index, message: "Audit event time precedes the previous event." };
    }
    const { eventFingerprint, ...content } = event;
    if (eventFingerprint !== `audit:sha256:${await sha256(canonicalize(content))}`) {
      return { valid: false, invalidIndex: index, message: "Audit event fingerprint does not match its content." };
    }
    previous = eventFingerprint;
    previousOccurredAt = Date.parse(event.occurredAt);
  }
  return { valid: true, invalidIndex: null, message: `${events.length} audit event${events.length === 1 ? "" : "s"} form a valid ordered hash chain.` };
}

export function assessEnterpriseRetention(policyInput: EnterprisePolicy, input: {
  tenantId: string;
  kind: EnterpriseResourceKind | "audit-event";
  createdAt: string;
  asOf: string;
  legalHold: boolean;
}): {
  decision: "retain" | "deletion-eligible";
  reason: "legal-hold" | "retention-not-configured" | "inside-retention-window" | "retention-window-expired";
  expiresAt: string | null;
  automaticDeletion: false;
} {
  const policy = validateEnterprisePolicy(policyInput);
  if (!input || input.tenantId !== policy.tenantId || ![...RESOURCES, "audit-event"].includes(input.kind) ||
    !validDate(input.createdAt) || !validDate(input.asOf) || Date.parse(input.asOf) < Date.parse(input.createdAt) || typeof input.legalHold !== "boolean") {
    throw new Error("Invalid enterprise retention assessment.");
  }
  const days = policy.retentionDays[input.kind];
  if (input.legalHold) return { decision: "retain", reason: "legal-hold", expiresAt: null, automaticDeletion: false };
  if (days === undefined) return { decision: "retain", reason: "retention-not-configured", expiresAt: null, automaticDeletion: false };
  const expiresAt = new Date(Date.parse(input.createdAt) + days * 86_400_000).toISOString();
  return Date.parse(input.asOf) >= Date.parse(expiresAt)
    ? { decision: "deletion-eligible", reason: "retention-window-expired", expiresAt, automaticDeletion: false }
    : { decision: "retain", reason: "inside-retention-window", expiresAt, automaticDeletion: false };
}

export function validateEnterprisePolicy(policy: EnterprisePolicy): EnterprisePolicy {
  if (!policy || policy.enterprisePolicyVersion !== 1 || !ID.test(policy.tenantId) || !fingerprint(policy.sourceFingerprint) ||
    !Array.isArray(policy.roles) || policy.roles.length > 1_000 || !isRecord(policy.retentionDays) ||
    Object.keys(policy.retentionDays).some((kind) => ![...RESOURCES, "audit-event"].includes(kind as EnterpriseResourceKind))) {
    throw new Error("Invalid enterprise policy envelope.");
  }
  const roles = policy.roles.map((role, index) => {
    if (!role || !ID.test(role.role) || !Array.isArray(role.grants) || role.grants.length > 1_000) throw new Error(`Invalid enterprise role at index ${index}.`);
    const grants = role.grants.map((grant, grantIndex) => {
      if (!grant || !RESOURCES.includes(grant.resource) || !Array.isArray(grant.actions) || grant.actions.length === 0 ||
        !grant.actions.every((action) => ACTIONS.includes(action))) throw new Error(`Invalid enterprise grant at role ${role.role}, index ${grantIndex}.`);
      return { resource: grant.resource, actions: [...new Set(grant.actions)].sort() as EnterpriseAction[] };
    }).sort((a, b) => a.resource.localeCompare(b.resource));
    return { role: role.role, grants };
  }).sort((a, b) => a.role.localeCompare(b.role));
  assertUnique(roles.map((role) => role.role), "enterprise role");
  const retentionDays: EnterprisePolicy["retentionDays"] = {};
  for (const [kind, days] of Object.entries(policy.retentionDays)) {
    if (!Number.isInteger(days) || Number(days) < 1 || Number(days) > 3_650) throw new Error(`Invalid retention period for ${kind}.`);
    retentionDays[kind as keyof EnterprisePolicy["retentionDays"]] = Number(days);
  }
  return { enterprisePolicyVersion: 1, tenantId: policy.tenantId, sourceFingerprint: policy.sourceFingerprint, roles, retentionDays };
}

function validateAuthorizationRequest(request: EnterpriseAuthorizationRequest): EnterpriseAuthorizationRequest {
  if (!request || !ID.test(request.requestId) || !validDate(request.requestedAt) || !request.actor || !ID.test(request.actor.subjectId) ||
    !ID.test(request.actor.tenantId) || !Array.isArray(request.actor.roles) || request.actor.roles.length > 100 || !request.actor.roles.every((role) => ID.test(role)) ||
    !request.authentication || !bounded(request.authentication.issuer, 500) || !bounded(request.authentication.audience, 500) ||
    !fingerprint(request.authentication.credentialFingerprint) || !validDate(request.authentication.authenticatedAt) ||
    !validDate(request.authentication.expiresAt) || Date.parse(request.authentication.expiresAt) <= Date.parse(request.authentication.authenticatedAt) ||
    !ACTIONS.includes(request.action) || !request.resource || !ID.test(request.resource.tenantId) ||
    !RESOURCES.includes(request.resource.kind) || !ID.test(request.resource.id)) throw new Error("Invalid enterprise authorization request.");
  return structuredClone({ ...request, requestedAt: new Date(request.requestedAt).toISOString(), actor: {
    ...request.actor, roles: [...new Set(request.actor.roles)].sort()
  }, authentication: { ...request.authentication, authenticatedAt: new Date(request.authentication.authenticatedAt).toISOString(),
    expiresAt: new Date(request.authentication.expiresAt).toISOString() } });
}

function validDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0"); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && FINGERPRINT.test(value); }
function assertUnique(values: readonly string[], label: string): void { const duplicate = values.find((value, index) => values.indexOf(value) !== index); if (duplicate) throw new Error(`Duplicate ${label} id: ${duplicate}`); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
