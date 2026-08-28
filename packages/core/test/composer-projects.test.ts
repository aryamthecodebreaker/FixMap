import { describe, expect, it } from "vitest";
import {
  buildComposerProjects,
  composerProjectForPath,
  composerTestCommandForProject,
  resolveComposerSymbol
} from "../src/composer-projects.js";
import type { RepoFile } from "../src/types.js";

function file(path: string, textSample = ""): RepoFile {
  return {
    path,
    extension: path.slice(path.lastIndexOf(".")),
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: path.endsWith(".php") ? "code" : "config",
    textSample
  };
}

describe("Composer project evidence", () => {
  it("parses bounded autoload and test evidence while rejecting escaping roots", () => {
    const manifest = JSON.stringify({
      autoload: {
        "psr-4": { "Acme\\": ["src/", "../shared/src", "../../../outside"] },
        classmap: ["legacy/", "C:\\outside"]
      },
      scripts: { test: ["@phpunit"] },
      "require-dev": { "phpunit/phpunit": "^11" }
    });
    const projects = buildComposerProjects([
      file("services/api/composer.json", manifest),
      file("services/api/phpunit.xml", "<phpunit />")
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      path: "services/api/composer.json",
      root: "services/api",
      testScript: true,
      phpunitDependency: true,
      phpunitConfig: "services/api/phpunit.xml",
      classmap: ["services/api/legacy"]
    });
    expect(projects[0]?.psr4[0]?.roots).toEqual(["services/api/src", "services/shared/src"]);
    expect(composerTestCommandForProject(projects[0]!)).toMatchObject({
      command: "composer --working-dir services/api test"
    });
  });

  it("resolves PSR-4 and classmap candidates without inventing missing paths", () => {
    const project = buildComposerProjects([file("composer.json", JSON.stringify({
      autoload: {
        "psr-4": { "Acme\\": "src/", "Root\\": "" },
        classmap: ["legacy/"]
      }
    }))])[0]!;
    const paths = new Set(["composer.json", "RootThing.php", "src/Domain/User.php", "legacy/models/Token.php"]);
    const suffixes = new Map([
      ["User.php", ["src/Domain/User.php"]],
      ["Token.php", ["legacy/models/Token.php"]]
    ]);

    expect(resolveComposerSymbol(project, "Acme\\Domain\\User", paths, suffixes))
      .toEqual(["src/Domain/User.php"]);
    expect(resolveComposerSymbol(project, "Legacy\\Token", paths, suffixes))
      .toEqual(["legacy/models/Token.php"]);
    expect(resolveComposerSymbol(project, "Root\\RootThing", paths, suffixes)).toEqual(["RootThing.php"]);
    expect(resolveComposerSymbol(project, "Acme\\Missing", paths, suffixes)).toEqual([]);
  });

  it("selects the deepest unambiguous Composer owner", () => {
    const projects = buildComposerProjects([
      file("composer.json", "{}"),
      file("services/api/composer.json", "{}")
    ]);

    expect(composerProjectForPath(projects, "services/api/src/App.php")?.path)
      .toBe("services/api/composer.json");
    expect(composerProjectForPath(projects, "src/App.php")?.path).toBe("composer.json");
  });

  it("routes Pest only from an explicit dependency and keeps Composer scripts authoritative", () => {
    const pest = buildComposerProjects([
      file("services/api/composer.json", JSON.stringify({ "require-dev": { "pestphp/pest": "^3" } })),
      file("services/api/tests/Pest.php", "<?php\n")
    ])[0]!;
    const bare = buildComposerProjects([
      file("composer.json", "{}"),
      file("tests/Pest.php", "<?php\n")
    ])[0]!;
    const scripted = buildComposerProjects([
      file("composer.json", JSON.stringify({
        scripts: { test: "pest --parallel" },
        "require-dev": { "pestphp/pest": "^3" }
      }))
    ])[0]!;

    expect(composerTestCommandForProject(pest)).toEqual({
      command: "services/api/vendor/bin/pest",
      reason: "services/api/composer.json declares pestphp/pest and services/api/tests/Pest.php configures the suite",
      scopeDir: "services/api"
    });
    expect(composerTestCommandForProject(bare)).toBeUndefined();
    expect(composerTestCommandForProject(scripted)?.command).toBe("composer test");
  });
});
