import { describe, expect, it } from "vitest";
import { buildWorkspaceImpact, buildWorkspaceMap } from "../src/workspace.js";
import { buildGraphDependencyIndex, graphSourceFingerprint, invalidateIdentityGraph } from "../src/identity-graph.js";
import type { RepoFile, RepoMap } from "../src/types.js";

const workspaceOptions = { workspace: "acme-platform" } as const;

function file(path: string, textSample: string, kind: RepoFile["kind"] = "code"): RepoFile {
  return {
    path,
    contentFingerprint: graphSourceFingerprint(textSample),
    extension: /\.[^.]+$/.exec(path)?.[0]?.toLowerCase() ?? "",
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind,
    textSample
  };
}

function repo(root: string, files: RepoFile[]): RepoMap {
  return {
    root,
    files,
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: []
  };
}

describe("buildWorkspaceMap", () => {
  it("links Node packages across repositories with version and import evidence", () => {
    const auth = repo("/auth", [
      file("package.json", JSON.stringify({ name: "@internal/auth", version: "2.1.0" }), "config"),
      file("src/index.ts", "export function validateToken() {}")
    ]);
    const payments = repo("/payments", [
      file("package.json", JSON.stringify({
        name: "@internal/payments",
        version: "1.0.0",
        dependencies: { "@internal/auth": "^2.0.0" }
      }), "config"),
      file("src/charge.ts", "import { validateToken } from '@internal/auth';\nexport function charge() {}")
    ]);

    const workspace = buildWorkspaceMap([
      { id: "payments", repo: payments, revision: "pay-sha" },
      { id: "auth", repo: auth, revision: "auth-sha", remote: "https://example.test/auth.git" }
    ], workspaceOptions);

    expect(workspace.repositories.map((entry) => entry.id)).toEqual(["auth", "payments"]);
    expect(workspace.packages).toContainEqual(expect.objectContaining({
      repository: "auth",
      ecosystem: "node",
      name: "@internal/auth",
      version: "2.1.0"
    }));
    expect(workspace.dependencies).toEqual([expect.objectContaining({
      consumerRepository: "payments",
      providerRepository: "auth",
      package: "@internal/auth",
      requestedVersion: "^2.0.0",
      evidence: expect.arrayContaining([
        expect.objectContaining({ kind: "manifest", path: "package.json" }),
        expect.objectContaining({ kind: "import", path: "src/charge.ts" })
      ])
    })]);
    expect(workspace.identityGraph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: workspace.repositories[0]?.identity, kind: "repository" }),
      expect.objectContaining({ id: workspace.packages.find((entry) => entry.name === "@internal/auth")?.identity, kind: "package" })
    ]));
    expect(workspace.identityGraph.edges).toContainEqual(expect.objectContaining({
      id: workspace.dependencies[0]?.identity,
      kind: "depends-on"
    }));

    expect(buildWorkspaceImpact(workspace, ["auth"])).toEqual({
      seeds: ["auth"],
      repositories: [expect.objectContaining({ repository: "payments", distance: 1 })]
    });

    const authManifest = auth.files.find((entry) => entry.path === "package.json")!;
    const invalidation = invalidateIdentityGraph(workspace.identityGraph, buildGraphDependencyIndex(workspace.identityGraph), [{
      repository: "auth",
      path: "package.json",
      beforeFingerprint: authManifest.contentFingerprint,
      afterFingerprint: graphSourceFingerprint("updated auth manifest")
    }]);
    expect(invalidation.staleNodes).toContain(workspace.packages.find((entry) => entry.name === "@internal/auth")?.identity);
    expect(invalidation.staleEdges).toContain(workspace.dependencies[0]?.identity);
  });

  it("links Python distribution names to imported module namespaces", () => {
    const identity = repo("/identity", [
      file("pyproject.toml", "[project]\nname = 'identity-service'\nversion = '1.4.0'\n", "config"),
      file("identity/__init__.py", "def authenticate(): pass")
    ]);
    const api = repo("/api", [
      file("pyproject.toml", "[project]\nname = 'api-service'\ndependencies = ['identity-service>=1.2']\n", "config"),
      file("api/main.py", "from identity import authenticate\n")
    ]);

    const workspace = buildWorkspaceMap([{ id: "identity", repo: identity }, { id: "api", repo: api }], workspaceOptions);

    expect(workspace.dependencies).toContainEqual(expect.objectContaining({
      consumerRepository: "api",
      providerRepository: "identity",
      ecosystem: "python",
      package: "identity-service",
      requestedVersion: ">=1.2"
    }));
  });

  it("links Maven coordinates and Java package imports", () => {
    const auth = repo("/java-auth", [
      file("pom.xml", "<project><groupId>com.acme</groupId><artifactId>auth</artifactId><version>3.0.0</version></project>", "config"),
      file("src/main/java/com/acme/auth/Token.java", "package com.acme.auth; public class Token {}")
    ]);
    const orders = repo("/orders", [
      file("pom.xml", "<project><groupId>com.acme</groupId><artifactId>orders</artifactId><dependencies><dependency><groupId>com.acme</groupId><artifactId>auth</artifactId><version>3.0.0</version></dependency></dependencies></project>", "config"),
      file("src/main/java/com/acme/orders/Order.java", "package com.acme.orders;\nimport com.acme.auth.Token;\npublic class Order {}")
    ]);

    const workspace = buildWorkspaceMap([{ id: "java-auth", repo: auth }, { id: "orders", repo: orders }], workspaceOptions);

    expect(workspace.dependencies).toContainEqual(expect.objectContaining({
      consumerRepository: "orders",
      providerRepository: "java-auth",
      ecosystem: "maven",
      package: "com.acme:auth",
      requestedVersion: "3.0.0",
      evidence: expect.arrayContaining([expect.objectContaining({ kind: "import" })])
    }));
  });

  it("preserves submodule provenance and diagnoses invalid parents", () => {
    const empty = repo("/empty", []);
    const workspace = buildWorkspaceMap([{
      id: "child",
      repo: empty,
      relationship: { kind: "submodule", parentRepository: "missing", path: "vendor/child" }
    }], workspaceOptions);

    expect(workspace.repositories[0]?.relationship).toEqual({
      kind: "submodule",
      parentRepository: "missing",
      path: "vendor/child"
    });
    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-submodule-parent" }));
  });

  it("does not guess when multiple repositories provide one package identity", () => {
    const provider = (root: string) => repo(root, [
      file("package.json", JSON.stringify({ name: "@internal/auth", version: "1.0.0" }), "config")
    ]);
    const consumer = repo("/consumer", [
      file("package.json", JSON.stringify({ name: "consumer", dependencies: { "@internal/auth": "*" } }), "config")
    ]);
    const workspace = buildWorkspaceMap([
      { id: "auth-a", repo: provider("/a") },
      { id: "auth-b", repo: provider("/b") },
      { id: "consumer", repo: consumer }
    ], workspaceOptions);

    expect(workspace.dependencies).toEqual([]);
    expect(workspace.diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate-package" }));
  });

  it("rejects duplicate or unsafe repository IDs", () => {
    const empty = repo("/empty", []);
    expect(() => buildWorkspaceMap([{ id: "same", repo: empty }, { id: "same", repo: empty }], workspaceOptions))
      .toThrow("Duplicate workspace repository ID");
    expect(() => buildWorkspaceMap([{ id: "../escape", repo: empty }], workspaceOptions))
      .toThrow("Invalid workspace repository ID");
  });

  it("fails closed when cross-repository evidence lacks an exact file fingerprint", () => {
    const manifest = file("package.json", JSON.stringify({ name: "service" }), "config");
    delete manifest.contentFingerprint;
    expect(() => buildWorkspaceMap([{ id: "service", repo: repo("/service", [manifest]) }], workspaceOptions))
      .toThrow("requires an exact content fingerprint");
  });
});
