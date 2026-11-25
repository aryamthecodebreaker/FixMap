import { describe, expect, it } from "vitest";
import { buildImportGraph } from "../src/import-graph.js";
import { buildRustProjects } from "../src/rust-projects.js";
import type { RepoFile } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    extension: path.slice(path.lastIndexOf(".")),
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: path.endsWith(".rs") ? "code" : "config",
    textSample
  };
}

const crate = (root: string, name: string) => file(`${root}/Cargo.toml`, `[package]\nname = "${name}"\n`);

describe("Cargo manifest evidence", () => {
  it("reads table-form, dotted-key, multi-line inline and target-specific path dependencies", () => {
    const [app] = buildRustProjects([
      file("app/Cargo.toml", [
        "[package]",
        'name = "app" # the binary',
        "",
        "[dependencies]",
        'core.path = "../core"',
        'serde = "1"',
        'remote = { git = "https://example.test/remote.git" }',
        "util = {",
        '  path = "../util",',
        '  package = "acme-util",',
        "}",
        "",
        "[dependencies.store]",
        'path = "../store"',
        'features = ["sqlite"]',
        "",
        "[target.'cfg(windows)'.dependencies]",
        'winhelp = { path = "../winhelp" }',
        "",
        "[dev-dependencies]",
        'fixtures = { path = "../fixtures#1" }'
      ].join("\n")),
      crate("core", "core"),
      crate("util", "acme-util"),
      crate("store", "store"),
      crate("winhelp", "winhelp"),
      crate("fixtures#1", "fixtures")
    ]).filter((project) => project.root === "app");
    expect(app!.name).toBe("app");
    expect(app!.pathDependencies.map((dependency) => [dependency.alias, dependency.root, dependency.package ?? null])).toEqual([
      ["core", "core", null],
      ["fixtures", "fixtures#1", null],
      ["store", "store", null],
      ["util", "util", "acme-util"],
      ["winhelp", "winhelp", null]
    ]);
  });

  it("inherits workspace path dependencies declared in table form", () => {
    const projects = buildRustProjects([
      file("Cargo.toml", ["[workspace]", 'members = ["crates/*"]', "", "[workspace.dependencies.shared]", 'path = "crates/shared"'].join("\n")),
      file("crates/app/Cargo.toml", ["[package]", 'name = "app"', "", "[dependencies]", "shared.workspace = true"].join("\n")),
      crate("crates/shared", "shared")
    ]);
    const app = projects.find((project) => project.root === "crates/app")!;
    expect(app.pathDependencies.map((dependency) => dependency.root)).toEqual(["crates/shared"]);
  });

  it("finds the build script: default build.rs, a custom path, or none when build = false", () => {
    const projects = buildRustProjects([
      crate("a", "a"),
      file("a/build.rs", "fn main() {}\n"),
      file("b/Cargo.toml", '[package]\nname = "b"\nbuild = "tools/gen.rs"\n'),
      file("b/tools/gen.rs", "fn main() {}\n"),
      file("c/Cargo.toml", '[package]\nname = "c"\nbuild = false\n'),
      file("c/build.rs", "fn main() {}\n")
    ]);
    const byRoot = new Map(projects.map((project) => [project.root, project.buildScript]));
    expect(byRoot.get("a")).toBe("a/build.rs");
    expect(byRoot.get("b")).toBe("b/tools/gen.rs");
    expect(byRoot.get("c")).toBeUndefined();
  });

  it("links manifests to build scripts and dependency manifests, and resolves literal include! paths", () => {
    const graph = buildImportGraph([
      file("app/Cargo.toml", '[package]\nname = "app"\n\n[dependencies]\ncore = { path = "../core" }\n'),
      file("app/build.rs", "fn main() {}\n"),
      file("app/src/main.rs", [
        "const SCHEMA: &str = include_str!(\"../schema.sql\");",
        "include!(\"generated/table.rs\");",
        "include!(concat!(env!(\"OUT_DIR\"), \"/bindings.rs\"));",
        "fn main() {}"
      ].join("\n")),
      file("app/schema.sql", "create table t (id int);\n"),
      file("app/src/generated/table.rs", "pub const T: u8 = 1;\n"),
      crate("core", "core"),
      file("core/src/lib.rs", "pub fn run() {}\n")
    ]);
    expect([...(graph.imports.get("app/Cargo.toml") ?? [])].sort()).toEqual(["app/build.rs", "core/Cargo.toml"]);
    expect([...(graph.imports.get("app/src/main.rs") ?? [])].sort()).toEqual(["app/schema.sql", "app/src/generated/table.rs"]);
  });
});
