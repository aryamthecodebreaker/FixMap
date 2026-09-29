import { buildFixMapAnalysis } from "./plan.js";
import type { EditorSnapshotInput } from "./editor-session.js";

/** Local lexical analysis only; report and editor graph share one scan and exclusions. */
export async function loadEditorSnapshot(input: {
  repoRoot: string;
  issueText: string;
  useCache?: boolean;
  includeHistory?: boolean;
  exclude?: string[];
}): Promise<EditorSnapshotInput> {
  const { report, repo, exclusions } = await buildFixMapAnalysis(input);
  const error = report.diagnostics.find((entry) => entry.severity === "error");
  if (error) throw new Error(error.message);
  return {
    report,
    repository: {
      ...repo,
      files: repo.files.filter((file) => !exclusions.excludes(file.path)),
      changedFiles: repo.changedFiles.filter((path) => !exclusions.excludes(path)),
      ...(repo.trackedFiles ? { trackedFiles: repo.trackedFiles.filter((path) => !exclusions.excludes(path)) } : {})
    }
  };
}
