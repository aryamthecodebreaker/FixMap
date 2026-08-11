import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { FileExplanation, RepoMap } from "@aryam/fixmap-core";

/** Resolve the two filesystem causes the pure core explainer cannot inspect. */
export async function clarifyMissingPath(
  explanation: FileExplanation,
  repo: RepoMap,
  requestedPath: string
): Promise<FileExplanation> {
  if (explanation.status !== "not-scanned" || !explanation.summary.includes("no such path")) return explanation;
  const target = resolve(repo.root, requestedPath);
  const distance = relative(repo.root, target);
  if (distance === ".." || distance.startsWith(`..${sep}`) || isAbsolute(distance)) {
    return { ...explanation, reasons: [], summary: "Not scanned: the path is outside this repository." };
  }
  try {
    const metadata = await stat(target);
    if (metadata.isFile()) {
      const scanLimited = repo.diagnostics.some((entry) => entry.code === "scan-limit-reached");
      return {
        ...explanation,
        reasons: [],
        summary: scanLimited
          ? "Not scanned: the file exists, but the repository scan reached its file limit before including it."
          : "Not scanned: the file exists on disk but is ignored by Git."
      };
    }
  } catch { /* The specific answer is the missing path below. */ }
  return { ...explanation, reasons: [], summary: "Not scanned: no such path exists in this repository." };
}
