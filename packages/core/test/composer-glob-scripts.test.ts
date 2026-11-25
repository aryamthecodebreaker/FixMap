import { describe, expect, it } from "vitest";
import { buildComposerProjects, composerTestCommandForProject } from "../src/composer-projects.js";
import type { RepoFile } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    extension: path.slice(path.lastIndexOf(".")),
    sizeBytes: textSample.length,
    isSource: path.endsWith(".php"),
    isTest: false,
    kind: path.endsWith(".php") ? "code" : "config",
    textSample
  };
}

const manifest = (value: Record<string, unknown>) => JSON.stringify(value);

describe("Composer globs, custom test scripts, and Pest directories", () => {
  it("matches path repositories with partial-segment, ? and [...] globs like PHP glob()", () => {
    const projects = buildComposerProjects([
      file("composer.json", manifest({
        name: "acme/app",
        require: { "acme/billing-core": "*", "acme/auth": "*", "acme/legacy": "*", "acme/hidden": "*" },
        repositories: [
          { type: "path", url: "packages/billing-*" },
          { type: "path", url: "modules/aut?" },
          { type: "path", url: "old/[lL]egacy" },
          { type: "path", url: "packages/*" },
          { type: "path", url: "deep/**" }
        ]
      })),
      file("packages/billing-core/composer.json", manifest({ name: "acme/billing-core" })),
      file("modules/auth/composer.json", manifest({ name: "acme/auth" })),
      file("old/Legacy/composer.json", manifest({ name: "acme/legacy" })),
      file("packages/.hidden/composer.json", manifest({ name: "acme/hidden" }))
    ]);
    const app = projects.find((project) => project.path === "composer.json")!;
    expect(app.pathRepositoryPatterns).not.toContain("deep/**");
    expect(app.pathDependencies.map((dependency) => dependency.package)).toEqual(["acme/auth", "acme/billing-core", "acme/legacy"]);
  });

  it("routes through the single custom test script, following @script references, and fails closed on several", () => {
    const route = (scripts: Record<string, unknown>) =>
      composerTestCommandForProject(buildComposerProjects([file("app/composer.json", manifest({ name: "acme/app", scripts }))])[0]!);
    expect(route({ "test:unit": "vendor/bin/phpunit --testsuite unit", lint: "phpcs" })?.command)
      .toBe("composer --working-dir app run-script test:unit");
    expect(route({ tests: "@phpunit", phpunit: "phpunit -c phpunit.xml.dist" })).toBeUndefined();
    expect(route({ tests: "@run-tests", "run-tests": "vendor/bin/pest" })?.command).toBe("composer --working-dir app run-script tests");
    expect(route({ "test:unit": "phpunit", "test:feature": "pest" })).toBeUndefined();
    expect(route({ "test:style": "php-cs-fixer fix --dry-run" })).toBeUndefined();
    expect(route({ test: "phpunit", "test:unit": "phpunit" })?.command).toBe("composer --working-dir app test");
  });

  it("names the literal Pest.php ->in() directories that exist", () => {
    const [project] = buildComposerProjects([
      file("composer.json", manifest({ name: "acme/app", "require-dev": { "pestphp/pest": "^3.0" } })),
      file("tests/Pest.php", "<?php\nuses(Tests\\TestCase::class)->in('Feature', \"Unit\");\nuses()->in($dynamic);\nuses()->in('Missing');\n"),
      file("tests/Feature/UserTest.php", "<?php\n"),
      file("tests/Unit/MathTest.php", "<?php\n")
    ]);
    expect(project!.pestDirectories).toEqual(["tests/Feature", "tests/Unit"]);
    expect(composerTestCommandForProject(project!)?.reason)
      .toBe("composer.json declares pestphp/pest and tests/Pest.php configures the suite (test directories: tests/Feature, tests/Unit)");
  });
});

describe("PHP directory-anchored includes", () => {
  it("resolves __DIR__ and dirname() anchored includes and leaves variable includes unresolved", async () => {
    const { buildImportGraph } = await import("../src/import-graph.js");
    const graph = buildImportGraph([
      file("src/Http/Kernel.php", [
        "<?php",
        "require_once __DIR__ . '/Routes.php';",
        "require dirname(__FILE__) . '/Middleware.php';",
        "include dirname(__DIR__) . '/bootstrap.php';",
        "require_once(dirname(__DIR__, 2) . '/config/app.php');",
        "include $path . '/Dynamic.php';",
        "include __DIR__ . '/' . $name . '.php';"
      ].join("\n")),
      file("src/Http/Routes.php", "<?php\n"),
      file("src/Http/Middleware.php", "<?php\n"),
      file("src/bootstrap.php", "<?php\n"),
      file("config/app.php", "<?php\n"),
      file("src/Http/Dynamic.php", "<?php\n")
    ]);
    expect([...(graph.imports.get("src/Http/Kernel.php") ?? [])].sort()).toEqual([
      "config/app.php", "src/Http/Middleware.php", "src/Http/Routes.php", "src/bootstrap.php"
    ]);
  });
});
