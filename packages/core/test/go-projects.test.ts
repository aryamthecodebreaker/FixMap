import { describe, expect, it } from "vitest";
import { buildGoModules, buildGoWorkspaces, goModuleForPath, goWorkspaceForModules } from "../src/go-projects.js";
import type { RepoFile } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return { path, extension: path.endsWith(".go") ? ".go" : "", sizeBytes: textSample.length, isSource: true, isTest: false, kind: "config", textSample };
}

describe("Go workspace evidence", () => {
  it("parses literal workspace modules and rejects missing, absolute, escaping, and glob paths", () => {
    const files = [
      file("go.work", [
        "go 1.24",
        "use (",
        "  ./services/api",
        "  ./services/auth // reviewed local module",
        "  ./services/missing",
        "  ../outside",
        "  C:\\outside",
        "  ./services/*",
        ")"
      ].join("\n")),
      file("services/api/go.mod", "module corp.example/api\n"),
      file("services/auth/go.mod", "module corp.example/auth\n")
    ];
    const modules = buildGoModules(files);
    const workspaces = buildGoWorkspaces(files, modules);

    expect(modules.map((module) => module.name)).toEqual(["corp.example/api", "corp.example/auth"]);
    expect(workspaces).toEqual([{
      path: "go.work",
      root: "",
      moduleRoots: ["services/api", "services/auth"]
    }]);
    expect(goModuleForPath(modules, "services/api/cmd/server/main.go")?.name).toBe("corp.example/api");
    expect(goWorkspaceForModules(workspaces, "services/api", "services/auth")?.path).toBe("go.work");
  });

  it("supports a nested single-line use declaration", () => {
    const files = [
      file("platform/go.work", "go 1.24\nuse ./api\n"),
      file("platform/api/go.mod", "module corp.example/api\n")
    ];
    expect(buildGoWorkspaces(files)).toEqual([{
      path: "platform/go.work",
      root: "platform",
      moduleRoots: ["platform/api"]
    }]);
  });
});
