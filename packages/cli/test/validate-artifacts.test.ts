import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";

const fixtures = join(__dirname, "..", "..", "core", "test", "fixtures", "compat");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function cli(args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { code, stdout, stderr };
}

describe("fixmap validate for saved artifacts", () => {
  it("accepts every kind an older release wrote", async () => {
    for (const file of ["change-dossier", "annotation-store", "capability-store", "outcome-record", "architecture-policy", "agent-intent", "workspace-map"]) {
      const result = await cli(["validate", join(fixtures, "0.9.7", `${file}.json`), "--format", "json"]);
      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, kind: file, version: 1 });
    }
  });

  it("keeps the report output unchanged", async () => {
    const result = await cli(["validate", join(fixtures, "0.9.0", "report.json")]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^Valid FixMap report: .*reportVersion 1\)\.\n$/);
  });

  it("rejects artifacts from a newer FixMap, unknown JSON, and damaged artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-validate-"));
    roots.push(root);
    const dossier = JSON.parse(await readFile(join(fixtures, "0.9.7", "change-dossier.json"), "utf8"));
    await writeFile(join(root, "newer.json"), JSON.stringify({ ...dossier, changeDossierVersion: 3 }));
    await writeFile(join(root, "other.json"), JSON.stringify({ name: "not fixmap" }));
    await writeFile(join(root, "broken.json"), JSON.stringify({ ...dossier, request: 42 }));
    const newer = await cli(["validate", join(root, "newer.json")]);
    expect(newer.code).toBe(1);
    expect(newer.stderr).toMatch(/changeDossierVersion 3, written by a newer FixMap.*upgrade FixMap/);
    const other = await cli(["validate", join(root, "other.json")]);
    expect(other.stderr).toMatch(/Not a recognized FixMap artifact/);
    expect((await cli(["validate", join(root, "broken.json")])).code).toBe(1);
  });
});
