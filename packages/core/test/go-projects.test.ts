import { describe, expect, it } from "vitest";
import { buildGoModules, buildGoWorkspaces, goModuleForPath, goReplacementForImport, goWorkspaceForModules } from "../src/go-projects.js";
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

  it("parses unambiguous local replace directives and rejects unresolved targets", () => {
    const files = [
      file("services/app/go.mod", [
        "module corp.example/app",
        "replace legacy.example/auth => ../auth",
        "replace (",
        "  legacy.example/payments v1.2.3 => ../payments",
        "  legacy.example/auth/token => ../token-auth",
        "  legacy.example/remote => corp.example/remote v1.4.0",
        "  legacy.example/missing => ../missing",
        "  legacy.example/escape => ../../../outside",
        "  legacy.example/absolute => C:\\outside",
        "  legacy.example/glob => ../*",
        "  legacy.example/ambiguous => ../auth",
        "  legacy.example/ambiguous => ../payments",
        "  legacy.example/duplicate => ../auth",
        "  legacy.example/duplicate => ../auth",
        ")"
      ].join("\n")),
      file("services/broken/go.mod", [
        "module corp.example/broken",
        "replace (",
        "  legacy.example/broken => ../auth"
      ].join("\n")),
      file("services/auth/go.mod", "module corp.internal/auth\n"),
      file("services/payments/go.mod", "module corp.internal/payments\n"),
      file("services/token-auth/go.mod", "module corp.internal/token-auth\n")
    ];
    const modules = buildGoModules(files);
    const app = modules.find((module) => module.name === "corp.example/app")!;

    expect(app.replacements).toEqual([
      { module: "legacy.example/auth/token", targetRoot: "services/token-auth" },
      { module: "legacy.example/payments", targetRoot: "services/payments" },
      { module: "legacy.example/auth", targetRoot: "services/auth" }
    ]);
    expect(goReplacementForImport(app, "legacy.example/auth/token/session"))
      .toEqual({ module: "legacy.example/auth/token", targetRoot: "services/token-auth" });
    expect(goReplacementForImport(app, "legacy.example/auth/user"))
      .toEqual({ module: "legacy.example/auth", targetRoot: "services/auth" });
    expect(goReplacementForImport(app, "legacy.example/remote")).toBeUndefined();
    expect(modules.find((module) => module.name === "corp.example/broken")?.replacements).toEqual([]);
  });
});
