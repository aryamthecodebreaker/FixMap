import { describe, expect, it } from "vitest";
import {
  compareContractInventories,
  contractGraphNodes,
  contractSourcesFromRepo,
  inventoryContracts,
  renderContractComparisonMarkdown
} from "../src/contracts.js";
import { buildIdentityGraph, createGraphIdentity } from "../src/identity-graph.js";
import type { ContractSource } from "../src/contracts.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function source(path: string, content: string, version: string): ContractSource {
  return { path, content, fingerprint: `content:${version.padEnd(16, "0")}` };
}

function compare(path: string, before: string, after: string) {
  return compareContractInventories(
    inventoryContracts([source(path, before, "before")]),
    inventoryContracts([source(path, after, "after")])
  );
}

describe("Contract Guardian", () => {
  it("classifies removed OpenAPI operations and newly required parameters as breaking", () => {
    const before = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Users" },
      paths: {
        "/users": {
          get: {},
          post: { parameters: [{ name: "trace", in: "header", required: false, schema: { type: "string" } }] }
        }
      }
    });
    const after = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Users" },
      paths: {
        "/users": {
          post: { parameters: [
            { name: "trace", in: "header", required: false, schema: { type: "string" } },
            { name: "tenant", in: "header", required: true, schema: { type: "string" } }
          ] }
        }
      }
    });

    const result = compare("openapi.json", before, after);
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry: "operation:GET /users", change: "entry-removed", compatibility: "breaking" }),
      expect.objectContaining({ entry: "argument:POST /users:header:tenant", change: "entry-added", compatibility: "breaking" })
    ]));
    expect(result.changes.every((change) => change.evidence.beforeFingerprint || change.evidence.afterFingerprint)).toBe(true);
  });

  it("classifies optional OpenAPI fields and operations as compatible", () => {
    const before = JSON.stringify({ openapi: "3.0.0", paths: {}, components: { schemas: { User: { type: "object", properties: { id: { type: "string" } } } } } });
    const after = JSON.stringify({
      openapi: "3.0.0",
      paths: { "/health": { get: {} } },
      components: { schemas: { User: { type: "object", properties: { id: { type: "string" }, nickname: { type: "string" } } } } }
    });
    const result = compare("api/openapi.json", before, after);
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry: "operation:GET /health", compatibility: "compatible" }),
      expect.objectContaining({ entry: "field:User.nickname", compatibility: "compatible" })
    ]));
  });

  it("finds breaking GraphQL field removal, type changes, and required arguments", () => {
    const result = compare(
      "schema.graphql",
      "type Query { user(id: ID!): User }\ntype User { id: ID! name: String }",
      "type Query { user(id: String!, tenant: ID!): User }\ntype User { id: ID! }"
    );
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry: "argument:Query.user:id", change: "entry-changed", compatibility: "breaking" }),
      expect.objectContaining({ entry: "argument:Query.user:tenant", compatibility: "breaking" }),
      expect.objectContaining({ entry: "field:User.name", change: "entry-removed", compatibility: "breaking" })
    ]));
  });

  it("tracks GraphQL and Protobuf enum values as compatibility surface", () => {
    const graphql = compare("schema.graphql", "enum Role { USER ADMIN }", "enum Role { USER OWNER }");
    expect(graphql.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry: "field:Role.ADMIN", change: "entry-removed", compatibility: "breaking" }),
      expect.objectContaining({ entry: "field:Role.OWNER", change: "entry-added", compatibility: "compatible" })
    ]));
    const protobuf = compare("role.proto", "enum Role { USER = 0; ADMIN = 1; }", "enum Role { USER = 0; OWNER = 1; }");
    expect(protobuf.changes).toContainEqual(expect.objectContaining({
      entry: "field:Role#1",
      change: "entry-changed",
      compatibility: "breaking"
    }));
  });

  it("keys Protobuf fields by wire number and catches incompatible reuse", () => {
    const result = compare(
      "user.proto",
      "message User { string name = 1; } service Users { rpc Get (GetUser) returns (User); }",
      "message User { int64 account_id = 1; string nickname = 2; } service Users { rpc Get (GetUser) returns (User); rpc List (ListUsers) returns (Users); }"
    );
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry: "field:User#1", change: "entry-changed", compatibility: "breaking" }),
      expect.objectContaining({ entry: "field:User#2", change: "entry-added", compatibility: "compatible" }),
      expect.objectContaining({ entry: "operation:Users.List", compatibility: "compatible" })
    ]));
  });

  it("detects AsyncAPI channel removal and OpenAPI YAML operation removal", () => {
    const asyncResult = compare(
      "asyncapi.yaml",
      "asyncapi: 3.0.0\nchannels:\n  user.created:\n    publish:\n      message: {}\n",
      "asyncapi: 3.0.0\nchannels: {}\n"
    );
    expect(asyncResult.changes).toContainEqual(expect.objectContaining({ entry: "operation:publish:user.created", compatibility: "breaking" }));

    const openApiResult = compare(
      "openapi.yaml",
      "openapi: 3.1.0\npaths:\n  /users:\n    get:\n      responses: {}\n",
      "openapi: 3.1.0\npaths: {}\n"
    );
    expect(openApiResult.changes).toContainEqual(expect.objectContaining({ entry: "operation:GET /users", compatibility: "breaking" }));
  });

  it("flags destructive migrations while treating additive statements as compatible", () => {
    const result = compare(
      "db/migrations/002_users.sql",
      "ALTER TABLE users ADD COLUMN nickname text;",
      "ALTER TABLE users ADD COLUMN nickname text; ALTER TABLE users DROP COLUMN legacy_name;"
    );
    expect(result.changes).toContainEqual(expect.objectContaining({
      change: "entry-added",
      compatibility: "breaking",
      reason: expect.stringContaining("DROP COLUMN")
    }));
  });

  it("creates exact contract graph nodes under an explicit owner", () => {
    const inventory = inventoryContracts([source("schema.graphql", "type Query { ok: Boolean }", "graph")]);
    const repository = createGraphIdentity({ workspace: "acme", kind: "repository", key: "api" });
    const nodes = contractGraphNodes(inventory, { workspace: "acme", repository: "api", parent: repository });
    const graph = buildIdentityGraph({
      workspace: "acme",
      nodes: [{ id: repository, kind: "repository", key: "api", repository: "api", derivedFrom: [] }, ...nodes],
      edges: []
    });
    expect(graph.nodes).toContainEqual(expect.objectContaining({
      kind: "contract",
      parent: repository,
      derivedFrom: [expect.objectContaining({ fingerprint: inventory.surfaces[0]?.sourceFingerprint })]
    }));
  });

  it("renders compatibility classes without dropping source paths", () => {
    const result = compare(
      "schema.graphql",
      "type Query { user: String old: String }",
      "type Query { user: String added: String }"
    );
    const markdown = renderContractComparisonMarkdown(result);
    expect(markdown).toContain("## Breaking");
    expect(markdown).toContain("## Compatible");
    expect(markdown).toContain("`schema.graphql`");
  });

  it("reports incomplete scanner sources instead of silently treating them as absent", () => {
    const file: RepoFile = {
      path: "openapi.yaml",
      contentFingerprint: "worktree:" + "a".repeat(64),
      extension: ".yaml",
      sizeBytes: 100_000,
      isTest: false,
      isSource: true,
      kind: "config",
      textSample: "",
      textSampleComplete: false,
      textSampleSkipReason: "too-large"
    };
    const repo: RepoMap = {
      root: "/repo",
      files: [file],
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: []
    };
    const discovered = contractSourcesFromRepo(repo);
    expect(discovered.sources).toEqual([]);
    expect(discovered.diagnostics).toContainEqual(expect.objectContaining({ code: "contract-source-incomplete" }));
  });

  it("does not misreport a temporarily unparseable contract as removed", () => {
    const previous = inventoryContracts([source("schema.graphql", "type Query { ok: Boolean }", "before")]);
    const current = inventoryContracts([source("schema.graphql", "this is not GraphQL SDL", "after")]);
    const result = compareContractInventories(previous, current);
    expect(result.changes).toEqual([expect.objectContaining({
      change: "contract-unavailable",
      compatibility: "unknown",
      evidence: { beforeFingerprint: "content:before0000000000" }
    })]);
    expect(result.changes.some((change) => change.change === "contract-removed")).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "contract-parse-failed" }));
  });

  it("produces identical surfaces and deltas for equivalent OpenAPI JSON and YAML", () => {
    const beforeJson = {
      openapi: "3.1.0",
      info: { title: "Users" },
      paths: {
        "/users/{id}": {
          get: { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] },
          delete: {}
        }
      },
      components: { schemas: { User: { type: "object", required: ["id"], properties: { id: { type: "string" }, email: { type: "string", format: "email" } } } } }
    };
    const afterJson = {
      openapi: "3.1.0",
      info: { title: "Users" },
      paths: {
        "/users/{id}": {
          get: { parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            { name: "expand", in: "query", required: false, schema: { type: "string" } }
          ] }
        }
      },
      components: { schemas: { User: { type: "object", required: ["id", "email"], properties: { id: { type: "string" }, email: { type: "string", format: "email" } } } } }
    };
    const beforeYaml = [
      "# Users API",
      "openapi: 3.1.0",
      "info:",
      "  title: Users",
      "  description: |",
      "    Multi-line text with a # that is not a comment",
      "    and: a colon.",
      "paths:",
      "  '/users/{id}':",
      "    get:",
      "      parameters:",
      "        - name: id",
      "          in: path",
      "          required: true",
      "          schema: { type: string }",
      "    delete: {}",
      "components:",
      "  schemas:",
      "    User:",
      "      type: object",
      "      required: [id]",
      "      properties:",
      "        id:",
      "          type: string  # inline comment",
      "        email:",
      "          type: string",
      "          format: email",
      ""
    ].join("\n");
    const afterYaml = [
      "openapi: \"3.1.0\"",
      "info: { title: Users }",
      "paths:",
      "  /users/{id}:",
      "    get:",
      "      parameters:",
      "      - name: id",
      "        in: path",
      "        required: true",
      "        schema:",
      "          type: integer",
      "      - {name: expand, in: query, required: false, schema: {type: string}}",
      "components:",
      "  schemas:",
      "    User:",
      "      type: object",
      "      required:",
      "        - id",
      "        - email",
      "      properties:",
      "        id: { type: string }",
      "        email: { type: string, format: email }",
      ""
    ].join("\n");
    const jsonBefore = inventoryContracts([source("api/openapi.json", JSON.stringify(beforeJson), "before")]);
    const yamlBefore = inventoryContracts([source("api/openapi.json", beforeYaml, "before")].map((value) => ({ ...value, path: "api/openapi.yaml" })));
    expect(yamlBefore.diagnostics).toEqual([]);
    expect(yamlBefore.surfaces[0]).toMatchObject({ kind: "openapi", version: "3.1.0", name: "Users" });
    expect(yamlBefore.surfaces[0]!.entries).toEqual(jsonBefore.surfaces[0]!.entries);

    const strip = (comparison: ReturnType<typeof compareContractInventories>) =>
      comparison.changes.map(({ compatibility, change, entry, before, after, reason }) => ({ compatibility, change, entry, before, after, reason }));
    const jsonDelta = compare("api/openapi.json", JSON.stringify(beforeJson), JSON.stringify(afterJson));
    const yamlDelta = compare("api/openapi.yaml", beforeYaml, afterYaml);
    expect(strip(yamlDelta)).toEqual(strip(jsonDelta));
    expect(yamlDelta.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entry: "operation:DELETE /users/{id}", compatibility: "breaking" }),
      expect.objectContaining({ entry: "argument:GET /users/{id}:path:id", change: "entry-changed", compatibility: "breaking" }),
      expect.objectContaining({ entry: "argument:GET /users/{id}:query:expand", compatibility: "compatible" }),
      expect.objectContaining({ entry: "field:User.email", compatibility: "breaking" })
    ]));
  });

  it("produces identical AsyncAPI deltas for JSON and YAML", () => {
    const before = { asyncapi: "2.6.0", info: { title: "Events" }, channels: { "user.created": { publish: { message: {} } }, "user.deleted": { subscribe: {} } } };
    const after = { asyncapi: "2.6.0", info: { title: "Events" }, channels: { "user.created": { publish: { message: {} } } } };
    const beforeYaml = "asyncapi: 2.6.0\ninfo:\n  title: Events\nchannels:\n  user.created:\n    publish:\n      message: {}\n  user.deleted:\n    subscribe: {}\n";
    const afterYaml = "asyncapi: 2.6.0\ninfo:\n  title: Events\nchannels:\n  user.created:\n    publish:\n      message: {}\n";
    const json = compare("asyncapi.json", JSON.stringify(before), JSON.stringify(after));
    const yaml = compare("asyncapi.yml", beforeYaml, afterYaml);
    expect(yaml.changes.map((change) => [change.entry, change.compatibility])).toEqual(json.changes.map((change) => [change.entry, change.compatibility]));
    expect(yaml.changes).toEqual([expect.objectContaining({ entry: "operation:subscribe:user.deleted", compatibility: "breaking" })]);
  });

  it("reports unsupported or malformed YAML as an unparseable contract instead of guessing", () => {
    for (const content of [
      "openapi: 3.1.0\ncomponents:\n  schemas:\n    Base: &base\n      type: object\n    User: *base\n",
      "openapi: 3.1.0\npaths:\n  /a:\n    get: {}\n  /a:\n    post: {}\n",
      "openapi: 3.1.0\npaths: {unterminated\n",
      "openapi: 3.1.0\n---\nopenapi: 3.0.0\n"
    ]) {
      const inventory = inventoryContracts([source("openapi.yaml", content, "bad")]);
      expect(inventory.surfaces).toEqual([]);
      expect(inventory.diagnostics).toEqual([expect.objectContaining({ code: "contract-parse-failed", path: "openapi.yaml" })]);
    }
  });

  it("records declared specification versions", () => {
    const inventory = inventoryContracts([
      source("a.proto", "syntax = \"proto3\";\nmessage A { string id = 1; }", "a"),
      source("openapi.yaml", "openapi: 3.0\npaths: {}\n", "b"),
      source("schema.graphql", "type Query { ok: Boolean }", "c")
    ]);
    expect(inventory.surfaces.map((surface) => [surface.kind, surface.version])).toEqual([
      ["graphql", undefined], ["openapi", "3.0"], ["protobuf", "proto3"]
    ]);
  });

  it("fails closed on duplicate paths and invalid source paths", () => {
    const valid = source("schema.graphql", "type Query { ok: Boolean }", "one");
    expect(() => inventoryContracts([valid, valid])).toThrow("Duplicate contract source path");
    expect(() => inventoryContracts([source("../schema.graphql", "type Query { ok: Boolean }", "one")]))
      .toThrow("Invalid contract source path");
  });
});
