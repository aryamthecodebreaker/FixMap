import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { expect, it } from "vitest";
import { runEditorCommand } from "../src/editor-command.js";

it("serves the real scanned repository through a read-only editor command", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-editor-command-"));
  try {
    await writeFile(join(root, "auth.ts"), "export const authenticate = () => false;\n");
    const request = JSON.stringify({ editorProtocolVersion: 1, id: "one", method: "fixmap/change-scope", params: {
      workspace: "local", repository: "auth", anchors: [{ operation: "touch", path: "auth.ts" }], asOf: "2026-01-01T00:00:00Z"
    } });
    let result = "";
    let errors = "";
    const output = new Writable({ write(chunk, _encoding, done) { result += String(chunk); done(); } });
    expect(await runEditorCommand(["--issue", "authenticate fails", "--repo", root, "--no-cache"], {
      input: Readable.from([Buffer.from(request)]), output, stderr: (text) => { errors += text; }
    })).toBe(0);
    expect(errors).toBe("");
    expect(JSON.parse(result)).toMatchObject({ id: "one", result: { selected: [{ path: "auth.ts" }] } });
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

it.each([[], ["--issue", "task", "--repo", "https://example.com/repo"], ["--issue", "task", "--execute"], ["--issue", "task", "--issue", "again"]].map((args) => ({ args })))("rejects invalid startup arguments: %j", async ({ args }) => {
  let error = "";
  expect(await runEditorCommand(args, { stderr: (text) => { error += text; } })).toBe(1);
  expect(error).not.toBe("");
});
