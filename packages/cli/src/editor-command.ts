import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { createEditorSession, loadEditorSnapshot, runEditorStreams } from "@aryam/fixmap-core";

export const EDITOR_USAGE = "Usage: fixmap editor --issue <task> [--repo <local-path>] [--no-cache]\nLocal read-only NDJSON session on stdin/stdout. One startup scan; restart to rescan.\n";

export async function runEditorCommand(args: string[], io: {
  input?: Readable; output?: Writable; stdout?: (text: string) => void; stderr?: (text: string) => void;
} = {}): Promise<number> {
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
    (io.stdout ?? ((text: string) => process.stdout.write(text)))(EDITOR_USAGE);
    return 0;
  }
  try {
    const values = new Map<string, string>();
    let noCache = false;
    for (let index = 0; index < args.length; index++) {
      const key = args[index]!;
      if (key === "--no-cache" && !noCache) { noCache = true; continue; }
      if (!["--issue", "--repo"].includes(key) || values.has(key)) throw new Error("Unsupported or repeated editor option.");
      const value = args[++index];
      if (!value?.trim() || value.startsWith("--")) throw new Error(`Missing value for ${key}.`);
      values.set(key, value);
    }
    const issueText = values.get("--issue");
    if (!issueText || Buffer.byteLength(issueText) > 65_536) throw new Error("Editor requires --issue task text of at most 64 KiB.");
    const repo = values.get("--repo") ?? process.cwd();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(repo)) throw new Error("Editor requires a local repository path, not a URL.");
    const session = createEditorSession(await loadEditorSnapshot({ repoRoot: resolve(repo), issueText, useCache: !noCache }));
    try { await runEditorStreams(session.snapshot, io.input ?? process.stdin, io.output ?? process.stdout); }
    finally { session.close(); }
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : "Editor session failed."}\n`);
    return 1;
  }
}
