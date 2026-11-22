import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIdentityGraph, createGraphIdentity, type IdentityGraph, type MigrationStep } from "@aryam/fixmap-core";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";

const repository = createGraphIdentity({ workspace: "acme", kind: "repository", key: "users" });
const schema = createGraphIdentity({ workspace: "acme", kind: "file", parent: repository, key: "db/schema.sql" });
const service = createGraphIdentity({ workspace: "acme", kind: "file", parent: repository, key: "src/users.ts" });
const consumer = createGraphIdentity({ workspace: "acme", kind: "file", parent: repository, key: "src/consumer.ts" });
const contract = createGraphIdentity({ workspace: "acme", kind: "contract", parent: repository, key: "users-api" });

function graph(): IdentityGraph {
  return buildIdentityGraph({
    workspace: "acme",
    nodes: [
      { id: repository, kind: "repository", key: "users", derivedFrom: [] },
      { id: schema, kind: "file", key: "db/schema.sql", repository: "users", parent: repository, derivedFrom: [] },
      { id: service, kind: "file", key: "src/users.ts", repository: "users", parent: repository, derivedFrom: [] },
      { id: consumer, kind: "file", key: "src/consumer.ts", repository: "users", parent: repository, derivedFrom: [] },
      { id: contract, kind: "contract", key: "users-api", repository: "users", parent: repository, derivedFrom: [] }
    ],
    edges: []
  });
}

function step(id: string, overrides: Partial<MigrationStep> = {}): MigrationStep {
  return {
    id,
    summary: `Perform ${id}`,
    dependsOn: [],
    edits: [service],
    impacts: [consumer],
    contracts: [contract],
    compatibility: { mode: "not-required", reason: "Internal-only atomic change." },
    tests: [{ command: `npm test -- ${id}`, reason: `Verify ${id}.` }],
    rollback: { trigger: `${id} verification fails.`, action: `Revert ${id}.` },
    ...overrides
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    dependencies: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text)
    }
  };
}

async function writeInput(root: string, steps: MigrationStep[]): Promise<string> {
  const path = join(root, "migration.json");
  await writeFile(path, JSON.stringify({ migrationInputVersion: 1, graph: graph(), steps }), "utf8");
  return path;
}

describe("migration command", () => {
  it("renders dependency-ordered phases as deterministic JSON and review-only Markdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-migrate-"));
    const input = await writeInput(root, [
      step("contract", { dependsOn: ["expand"], edits: [consumer] }),
      step("expand", {
        edits: [schema],
        compatibility: {
          mode: "backward-compatible",
          reason: "Add the nullable column before writers use it.",
          exitCriteria: "Every supported deployment accepts both schemas."
        }
      })
    ]);
    const json = capture();
    const markdown = capture();

    expect(await runCli(["migrate", "--input", input, "--format", "json"], json.dependencies)).toBe(0);
    expect(JSON.parse(json.stdout.join("")).phases.map((phase: { stepIds: string[] }) => phase.stepIds))
      .toEqual([["expand"], ["contract"]]);
    expect(json.stderr).toEqual([]);

    expect(await runCli(["migrate", `--input=${input}`], markdown.dependencies)).toBe(0);
    expect(markdown.stdout.join("")).toContain("# FixMap migration plan");
    expect(markdown.stdout.join("")).toContain("## Phase 2");
    expect(markdown.stdout.join("")).toContain("Review-only plan");
    expect(markdown.stderr).toEqual([]);
  });

  it("fails closed for cycles and never overwrites its input", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-migrate-cycle-"));
    const input = await writeInput(root, [
      step("a", { dependsOn: ["b"] }),
      step("b", { dependsOn: ["a"] })
    ]);
    const cycle = capture();
    const collision = capture();

    expect(await runCli(["migrate", "--input", input], cycle.dependencies)).toBe(1);
    expect(cycle.stderr.join("")).toContain("dependency cycle");
    expect(cycle.stdout).toEqual([]);

    expect(await runCli(["migrate", "--input", input, "--output", input], collision.dependencies)).toBe(1);
    expect(collision.stderr.join("")).toContain("must not overwrite the input file");
  });

  it("renders a clean FixMap error when the input path is a directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-migrate-dir-"));
    const directory = join(root, "input");
    await mkdir(directory);
    const io = capture();

    expect(await runCli(["migrate", "--input", directory], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("is a directory; provide a file path");
    expect(io.stderr.join("")).not.toContain("EISDIR");
  });
});
