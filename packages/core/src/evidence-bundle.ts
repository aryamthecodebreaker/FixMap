import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { validateProviderResult, type EvidenceProvider } from "./evidence.js";

/** Fixed input bounds apply before parsing and before validating/cloning item arrays. */
export const EVIDENCE_BUNDLE_MAX_BYTES = 1_048_576;

/** Explicit local-file transport. Never executes a producer or reads beyond the byte cap. */
export async function readEvidenceProviderBundle(path: string): Promise<ReturnType<typeof parseEvidenceProviderBundle>> {
  let handle;
  try {
    if (!(await lstat(path)).isFile()) throw new Error("unsupported evidence path");
    handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.size > EVIDENCE_BUNDLE_MAX_BYTES) {
      throw new Error("unsupported evidence file");
    }
    // The extra byte detects growth after stat; bounded reads also handle short reads.
    const bytes = Buffer.alloc(EVIDENCE_BUNDLE_MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    if (length > EVIDENCE_BUNDLE_MAX_BYTES) throw new Error("oversized evidence file");
    const json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    return parseEvidenceProviderBundle(json);
  } catch {
    // Do not echo contents, filesystem internals, or private paths.
    throw new Error("Cannot import evidence bundle: provide a regular UTF-8 JSON file of at most 1 MiB with a valid version-1 envelope.");
  } finally {
    await handle?.close();
  }
}

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
