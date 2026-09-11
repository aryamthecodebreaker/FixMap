import { createHash } from "node:crypto";
import { validateProviderResult, type EvidenceProvider } from "./evidence.js";

/** Fixed input bounds apply before parsing and before validating/cloning item arrays. */
export const EVIDENCE_BUNDLE_MAX_BYTES = 1_048_576;

/**
 * Imports data only. Provider identity is an unverified producer claim, not an
 * attestation. The digest identifies exact input bytes, including whitespace.
 */
export function parseEvidenceProviderBundle(json: string): {
  provider: EvidenceProvider;
  documentSha256: string;
} {
  const fail = (): never => { throw new Error("Invalid evidence provider bundle."); };
  if (typeof json !== "string" || json.length > EVIDENCE_BUNDLE_MAX_BYTES ||
    Buffer.byteLength(json, "utf8") > EVIDENCE_BUNDLE_MAX_BYTES) {
    throw new Error("Evidence provider bundle exceeds the 1 MiB UTF-8 input limit.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return fail(); }
  // Unknown nested metadata must not drive recursive cloning beyond a safe depth.
  const pending: Array<{ value: unknown; depth: number }> = [{ value: parsed, depth: 0 }];
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (depth > 32) return fail();
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
    }
  }
  if (!record(parsed) || !keys(parsed, ["bundleVersion", "provider", "result"]) ||
    parsed.bundleVersion !== 1 || !record(parsed.provider) ||
    !keys(parsed.provider, ["id", "version"]) ||
    typeof parsed.provider.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(parsed.provider.id) ||
    typeof parsed.provider.version !== "string" || !parsed.provider.version.trim() ||
    parsed.provider.version.length > 100 || !record(parsed.result) ||
    !keys(parsed.result, ["items", "relationships"]) ||
    !Array.isArray(parsed.result.items) || parsed.result.items.length > 5_000 ||
    (parsed.result.relationships !== undefined &&
      (!Array.isArray(parsed.result.relationships) || parsed.result.relationships.length > 10_000))) return fail();
  const result = validateProviderResult(parsed.result);
  if (!result.success) return fail();
  const snapshot = { items: result.items, relationships: result.relationships };
  return {
    documentSha256: createHash("sha256").update(json, "utf8").digest("hex"),
    provider: {
      id: parsed.provider.id,
      version: parsed.provider.version,
      capabilities: { network: "never", executesCode: false },
      collect: () => structuredClone(snapshot)
    }
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
