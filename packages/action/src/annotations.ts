import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { addAnnotation, createAnnotation, readAnnotationStore, removeAnnotation, updateAnnotationStore, type CreateAnnotationInput } from "@aryam/fixmap-core";

/** Explicit checkout-only mutation; never contacts GitHub or executes repository code. */
export async function runAnnotationAction(input: string, repoRoot: string, allowWrite: boolean): Promise<string> {
  if (Buffer.byteLength(input, "utf8") > 32_768) throw new Error("annotation-request exceeds 32 KiB.");
  let request: unknown;
  try { request = JSON.parse(input); } catch { throw new Error("annotation-request must be valid JSON."); }
  if (!record(request) || !["list", "add", "remove"].includes(String(request.action))) throw new Error("annotation-request requires action: list, add, or remove.");
  const allowed = request.action === "list" ? ["action"] : request.action === "remove" ? ["action", "id"] : ["action", "scope", "note", "owner", "expiresAt"];
  if (Object.keys(request).some((key) => !allowed.includes(key))) throw new Error("annotation-request contains fields not allowed for this action.");
  if (request.action === "list") return `${JSON.stringify(await readAnnotationStore(repoRoot), null, 2)}\n`;
  if (!allowWrite) throw new Error("Annotation mutation requires allow-annotation-write: true.");
  if (request.action === "remove") {
    if (typeof request.id !== "string") throw new Error("Annotation removal requires an exact id.");
    const id = request.id;
    await updateAnnotationStore(repoRoot, (store) => removeAnnotation(store, id));
    return `${JSON.stringify({ action: "remove", id, path: ".fixmap/annotations.json" })}\n`;
  }
  if (!record(request.scope) || typeof request.note !== "string" ||
    (request.owner !== undefined && typeof request.owner !== "string") ||
    (request.expiresAt !== undefined && typeof request.expiresAt !== "string")) throw new Error("Invalid annotation scope, note, owner, or expiry.");
  const annotation = createAnnotation({
    scope: request.scope as CreateAnnotationInput["scope"], note: request.note,
    createdAt: new Date().toISOString(),
    ...(request.owner !== undefined ? { owner: request.owner as string } : {}),
    ...(request.expiresAt !== undefined ? { expiresAt: request.expiresAt as string } : {})
  });
  if ("path" in annotation.scope && annotation.scope.path) {
    const root = await realpath(repoRoot);
    const target = await realpath(resolve(root, annotation.scope.path));
    const inside = relative(root, target);
    if (!inside || isAbsolute(inside) || inside === ".." || inside.startsWith("../") || inside.startsWith("..\\") || !(await stat(target)).isFile()) {
      throw new Error("Annotation target must be an existing file inside the checkout.");
    }
  }
  await updateAnnotationStore(repoRoot, (store) => addAnnotation(store, annotation));
  return `${JSON.stringify({ action: "add", id: annotation.id, path: ".fixmap/annotations.json" })}\n`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
