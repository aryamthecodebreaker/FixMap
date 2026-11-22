import { describe, expect, it } from "vitest";
import { buildRustProjects, rustPathDependency, rustProjectForPath } from "../src/rust-projects.js";
import type { RepoFile } from "../src/types.js";

function file(path: string, textSample = ""): RepoFile {
  return {
    path,
    extension: path.endsWith(".rs") ? ".rs" : ".toml",
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: path.endsWith(".rs") ? "code" : "config",
    textSample
  };
}

describe("Cargo project evidence", () => {
  it("resolves direct renamed and inherited workspace path dependencies", () => {
    const projects = buildRustProjects([
      file("Cargo.toml", [
        "[workspace]",
        'members = ["crates/*"]',
        "[workspace.dependencies]",
        'shared = { package = "shared-core", path = "crates/shared" }'
      ].join("\n")),
      file("crates/app/Cargo.toml", [
        "[package]",
        'name = "app"',
        "[dependencies]",
        "shared = { workspace = true }",
        'renamed-util = { package = "util-core", path = "../util" }',
        'outside = { path = "../../../outside" }',
        'missing = { path = "../missing" }'
      ].join("\n")),
      file("crates/shared/Cargo.toml", '[package]\nname = "shared-core"'),
      file("crates/util/Cargo.toml", '[package]\nname = "util-core"')
    ]);

    const app = projects.find((project) => project.path === "crates/app/Cargo.toml")!;
    expect(app).toMatchObject({ root: "crates/app", name: "app" });
    expect(app.pathDependencies).toEqual([
      { alias: "renamed_util", package: "util-core", root: "crates/util", evidencePath: "crates/app/Cargo.toml" },
      { alias: "shared", package: "shared-core", root: "crates/shared", evidencePath: "Cargo.toml" }
    ]);
    expect(rustPathDependency(app, "renamed-util")?.root).toBe("crates/util");
    expect(rustProjectForPath(projects, "crates/app/src/main.rs")?.path).toBe("crates/app/Cargo.toml");
  });

  it("does not accept absolute, missing, or repository-escaping path dependencies", () => {
    const project = buildRustProjects([
      file("crates/app/Cargo.toml", [
        "[dependencies]",
        'absolute = { path = "C:\\outside" }',
        'escape = { path = "../../../outside" }',
        'missing = { path = "../missing" }'
      ].join("\n"))
    ])[0]!;

    expect(project.pathDependencies).toEqual([]);
  });
});
