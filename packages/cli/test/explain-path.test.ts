import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FileExplanation, RepoMap } from "@aryam/fixmap-core";
import { clarifyMissingPath } from "../src/explain-path.js";

function repo(root: string, diagnostics: RepoMap["diagnostics"] = []): RepoMap {
  return {
    root,
    files: [],
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics
  };
}

const missing: FileExplanation = {
  path: "ignored.ts",
  status: "not-scanned",
  score: 0,
  confidence: "low",
  reasons: [],
  summary: "Not scanned: no such path was present in the repository scan."
};

describe("clarifyMissingPath", () => {
  it("distinguishes an ignored file that exists from a nonexistent path", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-explain-cause-"));
    await writeFile(join(root, "ignored.ts"), "export const ignored = true;\n");

    const ignored = await clarifyMissingPath(missing, repo(root), "ignored.ts");
    const nonexistent = await clarifyMissingPath({ ...missing, path: "absent.ts" }, repo(root), "absent.ts");

    expect(ignored.summary).toBe("Not scanned: the file exists on disk but is ignored by Git.");
    expect(nonexistent.summary).toBe("Not scanned: no such path exists in this repository.");
  });

  it("names the scan limit when it is the observable cause", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-explain-limit-"));
    await writeFile(join(root, "ignored.ts"), "export const late = true;\n");

    const explanation = await clarifyMissingPath(missing, repo(root, [{
      code: "scan-limit-reached",
      severity: "warning",
      message: "Stopped scanning."
    }]), "ignored.ts");

    expect(explanation.summary).toContain("scan reached its file limit");
  });
});
