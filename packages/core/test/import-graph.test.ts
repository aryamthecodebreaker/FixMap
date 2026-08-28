import { describe, expect, it } from "vitest";
import { buildImportGraph, findImportProximity } from "../src/import-graph.js";
import type { RepoFile } from "../src/types.js";

function codeFile(path: string, textSample: string): RepoFile {
  const extension = path.slice(path.lastIndexOf("."));
  return { path, extension, sizeBytes: textSample.length, isSource: true, isTest: false, kind: "code", textSample };
}

describe("buildImportGraph", () => {
  it("resolves relative imports including compiled .js specifiers and index files", () => {
    const files = [
      codeFile("src/plan.ts", "import { rank } from \"./rank.js\";\nimport helpers from \"./helpers\";\n"),
      codeFile("src/rank.ts", "export const rank = 1;\n"),
      codeFile("src/helpers/index.ts", "export default {};\n")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("src/plan.ts") ?? [])].sort()).toEqual(["src/helpers/index.ts", "src/rank.ts"]);
    expect([...(graph.importedBy.get("src/rank.ts") ?? [])]).toEqual(["src/plan.ts"]);
  });

  it("handles parent-directory specifiers, re-exports, and require calls", () => {
    const files = [
      codeFile("src/http/server.ts", "const auth = require(\"../auth/session\");\nexport { reset } from \"../auth/reset.js\";\n"),
      codeFile("src/auth/session.ts", "export const session = 1;\n"),
      codeFile("src/auth/reset.ts", "export const reset = 1;\n")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("src/http/server.ts") ?? [])].sort()).toEqual(["src/auth/reset.ts", "src/auth/session.ts"]);
  });

  it("ignores bare package specifiers and specifiers escaping the repository root", () => {
    const files = [
      codeFile("src/a.ts", "import fs from \"node:fs\";\nimport lib from \"some-package\";\nimport up from \"../../outside.js\";\n")
    ];

    const graph = buildImportGraph(files);

    expect(graph.imports.get("src/a.ts")).toBeUndefined();
  });

  it("resolves imports through workspace package names", () => {
    const files = [
      codeFile("apps/web/page.ts", 'import { reset } from "@demo/auth";'),
      codeFile("packages/auth/package.json", JSON.stringify({ name: "@demo/auth", source: "src/index.ts" })),
      codeFile("packages/auth/src/index.ts", "export const reset = true;")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("apps/web/page.ts") ?? [])]).toEqual(["packages/auth/src/index.ts"]);
  });

  it("resolves strict-JSON tsconfig path aliases", () => {
    const files = [
      codeFile("apps/web/page.ts", 'import { reset } from "@auth/reset";'),
      codeFile("tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@auth/*": ["packages/auth/src/*"] } } })),
      codeFile("packages/auth/src/reset.ts", "export const reset = true;")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("apps/web/page.ts") ?? [])]).toEqual(["packages/auth/src/reset.ts"]);
  });

  it("resolves Python relative, package, and imported-module relationships", () => {
    const files = [
      codeFile("services/auth/app/api/reset.py", [
        "from ..services import tokens",
        "from app.models import User",
        "import app.audit.events"
      ].join("\n")),
      codeFile("services/auth/app/services/tokens.py", "def decode_token(value): return value"),
      codeFile("services/auth/app/models/User.py", "class User: pass"),
      codeFile("services/auth/app/audit/events.py", "def record(): pass")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("services/auth/app/api/reset.py") ?? [])].sort()).toEqual([
      "services/auth/app/audit/events.py",
      "services/auth/app/models/User.py",
      "services/auth/app/services/tokens.py"
    ]);
  });

  it("resolves Java imports, static imports, and package wildcards", () => {
    const files = [
      codeFile("service/src/main/java/com/acme/auth/ResetService.java", [
        "import com.acme.accounts.User;",
        "import static com.acme.security.TokenVerifier.verify;",
        "import com.acme.events.*;"
      ].join("\n")),
      codeFile("accounts/src/main/java/com/acme/accounts/User.java", "class User {}"),
      codeFile("security/src/main/java/com/acme/security/TokenVerifier.java", "class TokenVerifier {}"),
      codeFile("events/src/main/java/com/acme/events/PasswordReset.java", "class PasswordReset {}"),
      codeFile("events/src/main/java/com/acme/events/internal/Hidden.java", "class Hidden {}")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("service/src/main/java/com/acme/auth/ResetService.java") ?? [])].sort()).toEqual([
      "accounts/src/main/java/com/acme/accounts/User.java",
      "events/src/main/java/com/acme/events/PasswordReset.java",
      "security/src/main/java/com/acme/security/TokenVerifier.java"
    ]);
  });

  it("resolves Go imports inside the nearest declared module", () => {
    const files = [
      codeFile("go.mod", "module example.com/acme\n"),
      codeFile("cmd/server/main.go", "package main\nimport \"example.com/acme/auth\""),
      codeFile("auth/token.go", "package auth\ntype Token struct {}"),
      codeFile("auth/session.go", "package auth\nfunc Session() {}"),
      codeFile("auth/token_test.go", "package auth\nfunc TestToken() {}")
    ];
    const graph = buildImportGraph(files);
    expect([...(graph.imports.get("cmd/server/main.go") ?? [])].sort()).toEqual([
      "auth/session.go",
      "auth/token.go"
    ]);
  });

  it("resolves Rust crate, self-module, and symbol-qualified uses", () => {
    const files = [
      codeFile("Cargo.toml", "[package]\nname = 'acme'"),
      codeFile("src/lib.rs", "pub mod auth;"),
      codeFile("src/auth.rs", "pub struct Token;"),
      codeFile("src/service.rs", "use crate::auth::Token;")
    ];
    const graph = buildImportGraph(files);
    expect([...(graph.imports.get("src/lib.rs") ?? [])]).toEqual(["src/auth.rs"]);
    expect([...(graph.imports.get("src/service.rs") ?? [])]).toEqual(["src/auth.rs"]);
  });

  it("resolves renamed Cargo path dependencies, inherited workspace dependencies, and path modules", () => {
    const files = [
      codeFile("Cargo.toml", [
        "[workspace]",
        'members = ["crates/*"]',
        "[workspace.dependencies]",
        'shared = { package = "shared-core", path = "crates/shared" }'
      ].join("\n")),
      codeFile("crates/app/Cargo.toml", [
        "[package]",
        'name = "app"',
        "[dependencies]",
        "shared = { workspace = true }",
        'renamed-util = { package = "util-core", path = "../util" }'
      ].join("\n")),
      codeFile("crates/app/src/main.rs", [
        "use shared::Account;",
        "use renamed_util::auth::Token;",
        '#[path = "generated/custom.rs"]',
        "mod custom;"
      ].join("\n")),
      codeFile("crates/app/src/generated/custom.rs", "pub fn custom() {}"),
      codeFile("crates/shared/Cargo.toml", '[package]\nname = "shared-core"'),
      codeFile("crates/shared/src/lib.rs", "pub struct Account;"),
      codeFile("crates/util/Cargo.toml", '[package]\nname = "util-core"'),
      codeFile("crates/util/src/lib.rs", "pub mod auth;"),
      codeFile("crates/util/src/auth.rs", "pub struct Token;")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("crates/app/src/main.rs") ?? [])].sort()).toEqual([
      "crates/app/src/generated/custom.rs",
      "crates/shared/src/lib.rs",
      "crates/util/src/auth.rs"
    ]);
  });

  it("resolves Ruby relative and load-path requires", () => {
    const files = [
      codeFile("app/services/reset.rb", "require_relative '../tokens'\nrequire 'auth/audit'"),
      codeFile("app/tokens.rb", "class Token; end"),
      codeFile("lib/auth/audit.rb", "module Audit; end")
    ];
    const graph = buildImportGraph(files);
    expect([...(graph.imports.get("app/services/reset.rb") ?? [])].sort()).toEqual([
      "app/tokens.rb",
      "lib/auth/audit.rb"
    ]);
  });

  it("resolves PHP file includes and namespace symbols", () => {
    const files = [
      codeFile("src/Auth/Reset.php", "<?php\nnamespace Acme\\Auth;\nuse Acme\\Accounts\\User;\nrequire_once './Token.php';"),
      codeFile("src/Auth/Token.php", "<?php\nnamespace Acme\\Auth;\nclass Token {}"),
      codeFile("src/Accounts/User.php", "<?php\nnamespace Acme\\Accounts;\nclass User {}")
    ];
    const graph = buildImportGraph(files);
    expect([...(graph.imports.get("src/Auth/Reset.php") ?? [])].sort()).toEqual([
      "src/Accounts/User.php",
      "src/Auth/Token.php"
    ]);
  });

  it("resolves PHP symbols through Composer PSR-4 and classmap evidence", () => {
    const files = [
      codeFile("composer.json", JSON.stringify({
        autoload: {
          "psr-4": { "Acme\\": "src/" },
          classmap: ["legacy/"]
        }
      })),
      codeFile("app/Checkout.php", "<?php\nuse Acme\\Domain\\User;\nuse Legacy\\Token;\nclass Checkout {}"),
      codeFile("src/Domain/User.php", "<?php\nclass User {}"),
      codeFile("legacy/models/Token.php", "<?php\nclass Token {}")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("app/Checkout.php") ?? [])].sort()).toEqual([
      "legacy/models/Token.php",
      "src/Domain/User.php"
    ]);
  });

  it("resolves .NET namespace imports without matching labels across namespaces", () => {
    const files = [
      codeFile("Auth/ResetService.cs", "using Acme.Accounts;\nnamespace Acme.Auth;\nclass ResetService {}"),
      codeFile("Accounts/User.cs", "namespace Acme.Accounts;\nclass User {}"),
      codeFile("Accounts/Internal/Audit.cs", "namespace Acme.Accounts.Internal;\nclass Audit {}"),
      codeFile("Other/User.cs", "namespace Other.Accounts;\nclass User {}")
    ];
    const graph = buildImportGraph(files);
    expect([...(graph.imports.get("Auth/ResetService.cs") ?? [])]).toEqual(["Accounts/User.cs"]);
  });

  it("uses explicit .NET project references to scope namespace imports and graph projects", () => {
    const files = [
      codeFile("src/Auth/Auth.csproj", '<ProjectReference Include="..\\Accounts\\Accounts.csproj" />'),
      codeFile("src/Auth/ResetService.cs", "using Acme.Accounts;\nusing Acme.Contracts;\nnamespace Acme.Auth;\nclass ResetService {}"),
      codeFile("src/Accounts/Accounts.csproj", '<ProjectReference Include="..\\Contracts\\Contracts.csproj" />'),
      codeFile("src/Accounts/User.cs", "namespace Acme.Accounts;\nclass User {}"),
      codeFile("src/Contracts/Contracts.csproj", "<Project />"),
      codeFile("src/Contracts/Role.cs", "namespace Acme.Contracts;\nclass Role {}"),
      codeFile("src/Shadow/Shadow.csproj", "<Project />"),
      codeFile("src/Shadow/User.cs", "namespace Acme.Accounts;\nclass User {}")
    ];

    const graph = buildImportGraph(files);

    expect([...(graph.imports.get("src/Auth/ResetService.cs") ?? [])].sort()).toEqual([
      "src/Accounts/User.cs",
      "src/Contracts/Role.cs"
    ]);
    expect([...(graph.imports.get("src/Auth/Auth.csproj") ?? [])]).toEqual(["src/Accounts/Accounts.csproj"]);
    expect([...(graph.imports.get("src/Accounts/Accounts.csproj") ?? [])]).toEqual(["src/Contracts/Contracts.csproj"]);
    expect([...(graph.importedBy.get("src/Accounts/Accounts.csproj") ?? [])]).toEqual(["src/Auth/Auth.csproj"]);
  });

  it("reports when the graph file budget truncates parseable modules", () => {
    const files = Array.from({ length: 5_001 }, (_, index) =>
      codeFile(`src/module-${index}.ts`, `export const module${index} = ${index};`)
    );

    const graph = buildImportGraph(files);

    expect(graph.truncatedFiles).toBe(1);
  });
});

describe("findImportProximity", () => {
  const files = [
    codeFile("src/seed.ts", "import { helper } from \"./helper.js\";\n"),
    codeFile("src/helper.ts", "import { deep } from \"./deep.js\";\nexport const helper = 1;\n"),
    codeFile("src/deep.ts", "export const deep = 1;\n"),
    codeFile("src/consumer.ts", "import { seed } from \"./seed.js\";\n"),
    codeFile("src/unrelated.ts", "export const nothing = 1;\n")
  ];

  it("marks direct imports and importers at distance one and transitive files at distance two", () => {
    const graph = buildImportGraph(files);
    const proximity = findImportProximity(graph, ["src/seed.ts"]);

    expect(proximity.get("src/helper.ts")).toEqual({ distance: 1, seed: "src/seed.ts", direction: "imported-by" });
    expect(proximity.get("src/consumer.ts")).toEqual({ distance: 1, seed: "src/seed.ts", direction: "imports" });
    expect(proximity.get("src/deep.ts")?.distance).toBe(2);
    expect(proximity.has("src/seed.ts")).toBe(false);
    expect(proximity.has("src/unrelated.ts")).toBe(false);
  });

  it("returns nothing without seeds", () => {
    const graph = buildImportGraph(files);

    expect(findImportProximity(graph, []).size).toBe(0);
  });

  it("uses caller-provided seed priority when multiple seeds share a neighbor", () => {
    const graph = buildImportGraph([
      codeFile("src/a.ts", "import { shared } from './shared.js';"),
      codeFile("src/z.ts", "import { shared } from './shared.js';"),
      codeFile("src/shared.ts", "export const shared = 1;")
    ]);

    expect(findImportProximity(graph, ["src/z.ts", "src/a.ts"]).get("src/shared.ts")?.seed).toBe("src/z.ts");
  });

  it("preserves seed priority when two second-hop paths meet", () => {
    const graph = buildImportGraph([
      codeFile("src/a-low.ts", "import { aMid } from './a-mid.js';"),
      codeFile("src/a-mid.ts", "import { shared } from './shared.js';"),
      codeFile("src/z-high.ts", "import { zMid } from './z-mid.js';"),
      codeFile("src/z-mid.ts", "import { shared } from './shared.js';"),
      codeFile("src/shared.ts", "export const shared = 1;")
    ]);

    expect(findImportProximity(graph, ["src/z-high.ts", "src/a-low.ts"]).get("src/shared.ts"))
      .toEqual({ distance: 2, seed: "src/z-high.ts", direction: "imported-by" });
  });

  // `direction` describes the NEIGHBOR's relationship to the seed, which is deliberately the
  // inverse of the map the edge came from: neighbors drawn from `graph.imports` are files the
  // seed imports, so each of them is "imported-by" the seed. Reading the label against the map
  // name makes it look swapped (#409) and it is not — rank.ts renders it as a sentence about
  // the neighbor. Inverting these would reverse every proximity reason in the report.
  it("labels a neighbor by its relationship to the seed, not by the map it came from", () => {
    const graph = buildImportGraph([
      codeFile("src/a.ts", "import { b } from './b.js';"),
      codeFile("src/b.ts", "export const b = 1;"),
      codeFile("src/c.ts", "import { a } from './a.js';")
    ]);

    const proximity = findImportProximity(graph, ["src/a.ts"]);

    // a imports b, so b is imported by a.
    expect(proximity.get("src/b.ts")).toEqual({ distance: 1, seed: "src/a.ts", direction: "imported-by" });
    // c imports a, so c imports the seed.
    expect(proximity.get("src/c.ts")).toEqual({ distance: 1, seed: "src/a.ts", direction: "imports" });
  });

  it("includes single-file-component and NodeNext extensions in the graph", () => {
    const graph = buildImportGraph([
      codeFile("src/App.vue", "<script setup lang='ts'>import { reset } from './reset.mjs';</script>"),
      codeFile("src/reset.mts", "export const reset = 1;")
    ]);

    expect([...(graph.imports.get("src/App.vue") ?? [])]).toEqual(["src/reset.mts"]);
  });
});
