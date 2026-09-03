import { describe, expect, it } from "vitest";
import {
  buildGraphDependencyIndex,
  buildIdentityGraph,
  createGraphEdgeIdentity,
  createGraphEquivalence,
  createGraphIdentity,
  graphSourceFingerprint,
  invalidateIdentityGraph
} from "../src/identity-graph.js";
import type {
  GraphDerivation,
  GraphEntityKind,
  GraphRelationshipKind,
  IdentityGraphEdge,
  IdentityGraphNode
} from "../src/identity-graph.js";

const workspace = "acme-platform";

function node(
  kind: GraphEntityKind,
  key: string,
  options: { repository?: string; parent?: string; label?: string; derivedFrom?: GraphDerivation[] } = {}
): IdentityGraphNode {
  return {
    id: createGraphIdentity({ workspace, kind, key, repository: options.repository, parent: options.parent }),
    kind,
    key,
    ...(options.repository ? { repository: options.repository } : {}),
    ...(options.parent ? { parent: options.parent } : {}),
    ...(options.label ? { label: options.label } : {}),
    derivedFrom: options.derivedFrom ?? []
  };
}

function edge(
  kind: GraphRelationshipKind,
  from: string,
  to: string,
  derivedFrom: GraphDerivation[] = []
): IdentityGraphEdge {
  return {
    id: createGraphEdgeIdentity(kind, from, to),
    kind,
    from,
    to,
    confidence: "high",
    reason: `Explicit ${kind} relationship`,
    derivedFrom
  };
}

describe("graph identities", () => {
  it("creates stable identities across the complete hierarchy", () => {
    const repository = node("repository", "auth");
    const service = node("service", "user-service", { repository: "auth", parent: repository.id });
    const pkg = node("package", "@acme/auth", { repository: "auth", parent: service.id });
    const module = node("module", "users", { repository: "auth", parent: pkg.id });
    const file = node("file", "src/users.ts", { repository: "auth", parent: module.id });
    const symbol = node("symbol", "UserService", { repository: "auth", parent: file.id });
    const contract = node("contract", "openapi:user-v1", { repository: "auth", parent: service.id });
    const runtime = node("runtime-component", "docker:auth", { repository: "auth", parent: service.id });
    const deployment = node("deployment", "prod/auth", { repository: "auth", parent: runtime.id });

    const graph = buildIdentityGraph({ workspace, nodes: [deployment, symbol, repository, runtime, file, service, module, contract, pkg], edges: [] });

    expect(graph.nodes.map((entry) => entry.kind)).toEqual(expect.arrayContaining([
      "repository", "service", "package", "module", "file", "symbol", "contract", "runtime-component", "deployment"
    ]));
    expect(createGraphIdentity({ workspace, kind: "symbol", key: "UserService", parent: file.id, repository: "auth" }))
      .toBe(symbol.id);
    expect(createGraphIdentity({ workspace: "other", kind: "repository", key: "auth" })).not.toBe(repository.id);
  });

  it("records aliases and equivalence explicitly and never guesses from labels", () => {
    const repository = node("repository", "auth");
    const pkg = node("package", "@acme/auth", { parent: repository.id, label: "UserService" });
    const runtime = node("runtime-component", "docker/auth", { parent: repository.id, label: "UserService" });
    const withoutEquivalence = buildIdentityGraph({ workspace, nodes: [repository, pkg, runtime], edges: [] });
    expect(withoutEquivalence.edges).toEqual([]);

    const relation = createGraphEquivalence({
      kind: "equivalent-to",
      from: runtime.id,
      to: pkg.id,
      reason: "Reviewed service catalog mapping"
    });
    const reverse = createGraphEquivalence({
      kind: "equivalent-to",
      from: pkg.id,
      to: runtime.id,
      reason: "Reviewed service catalog mapping"
    });
    expect(reverse.id).toBe(relation.id);
    expect(buildIdentityGraph({ workspace, nodes: [repository, pkg, runtime], edges: [relation] }).edges).toEqual([relation]);
  });

  it("rejects duplicate, unknown, and non-canonical graph elements", () => {
    const repository = node("repository", "auth");
    expect(() => buildIdentityGraph({ workspace, nodes: [repository, repository], edges: [] })).toThrow("Duplicate graph node");
    expect(() => buildIdentityGraph({
      workspace,
      nodes: [repository],
      edges: [{ ...edge("contains", repository.id, repository.id), to: "fixmap://workspace/missing" }]
    })).toThrow("not canonically identified");
    expect(() => buildIdentityGraph({ workspace, nodes: [{ ...repository, id: repository.id.replace(workspace, "other") }], edges: [] }))
      .toThrow("does not belong to workspace");
  });
});

describe("graph versioning and invalidation", () => {
  function fixture() {
    const source = {
      kind: "source" as const,
      repository: "auth",
      path: "src/user-service.ts",
      fingerprint: graphSourceFingerprint("before")
    };
    const repository = node("repository", "auth");
    const file = node("file", "src/user-service.ts", { repository: "auth", parent: repository.id, derivedFrom: [source] });
    const symbol = node("symbol", "UserService", { repository: "auth", parent: file.id });
    const contract = node("contract", "openapi:user-v1", {
      repository: "auth",
      parent: repository.id,
      derivedFrom: [{ kind: "node", id: symbol.id }]
    });
    const runtime = node("runtime-component", "docker/auth", {
      repository: "auth",
      parent: repository.id,
      derivedFrom: [{ kind: "node", id: contract.id }]
    });
    const deployment = node("deployment", "prod/auth", { repository: "auth", parent: runtime.id });
    const unrelated = node("file", "README.md", { repository: "auth", parent: repository.id });
    const deployedAs = edge("deployed-as", runtime.id, deployment.id);
    const graph = buildIdentityGraph({
      workspace,
      nodes: [repository, file, symbol, contract, runtime, deployment, unrelated],
      edges: [deployedAs]
    });
    return { source, repository, file, symbol, contract, runtime, deployment, unrelated, deployedAs, graph };
  }

  it("cascades one changed file through derived nodes, hierarchy, and edge endpoints", () => {
    const value = fixture();
    const invalidation = invalidateIdentityGraph(value.graph, buildGraphDependencyIndex(value.graph), [{
      repository: "auth",
      path: value.source.path,
      beforeFingerprint: value.source.fingerprint,
      afterFingerprint: graphSourceFingerprint("after")
    }]);

    expect(invalidation.staleNodes).toEqual(expect.arrayContaining([
      value.file.id, value.symbol.id, value.contract.id, value.runtime.id, value.deployment.id
    ]));
    expect(invalidation.staleNodes).not.toContain(value.repository.id);
    expect(invalidation.staleNodes).not.toContain(value.unrelated.id);
    expect(invalidation.staleEdges).toEqual([value.deployedAs.id]);
    expect(invalidation.toVersion.sequence).toBe(value.graph.version.sequence + 1);
    expect(invalidation.toVersion.parentFingerprint).toBe(value.graph.version.fingerprint);
  });

  it("keeps the version unchanged when the source fingerprint did not change", () => {
    const value = fixture();
    const invalidation = invalidateIdentityGraph(value.graph, buildGraphDependencyIndex(value.graph), [{
      repository: "auth",
      path: value.source.path,
      beforeFingerprint: value.source.fingerprint,
      afterFingerprint: value.source.fingerprint
    }]);
    expect(invalidation.staleNodes).toEqual([]);
    expect(invalidation.staleEdges).toEqual([]);
    expect(invalidation.toVersion).toEqual(value.graph.version);
  });

  it("rejects stale baselines and dependency indexes from other graph versions", () => {
    const value = fixture();
    const index = buildGraphDependencyIndex(value.graph);
    expect(() => invalidateIdentityGraph(value.graph, index, [{
      repository: "auth",
      path: value.source.path,
      beforeFingerprint: graphSourceFingerprint("wrong"),
      afterFingerprint: graphSourceFingerprint("after")
    }])).toThrow("does not match the indexed before fingerprint");
    expect(() => invalidateIdentityGraph(value.graph, { ...index, graphFingerprint: "different" }, []))
      .toThrow("different graph version");
  });

  it("treats a rename as a source change and produces deterministic versions", () => {
    const value = fixture();
    const index = buildGraphDependencyIndex(value.graph);
    const changes = [{
      repository: "auth",
      path: value.source.path,
      beforeFingerprint: value.source.fingerprint,
      afterFingerprint: value.source.fingerprint,
      renamedTo: "src/users.ts"
    }];
    const first = invalidateIdentityGraph(value.graph, index, changes);
    const second = invalidateIdentityGraph(value.graph, index, [...changes].reverse());
    expect(first.staleNodes).toContain(value.file.id);
    expect(second).toEqual(first);
  });

  it("rejects conflicting duplicate source changes", () => {
    const value = fixture();
    const index = buildGraphDependencyIndex(value.graph);
    expect(() => invalidateIdentityGraph(value.graph, index, [
      { repository: "auth", path: value.source.path, afterFingerprint: graphSourceFingerprint("one") },
      { repository: "auth", path: value.source.path, afterFingerprint: graphSourceFingerprint("two") }
    ])).toThrow("Conflicting graph source changes");
  });

  it("normalizes derivation order when versioning graph snapshots", () => {
    const repository = node("repository", "auth");
    const firstSource = { kind: "source" as const, repository: "auth", path: "a.ts", fingerprint: graphSourceFingerprint("a") };
    const secondSource = { kind: "source" as const, repository: "auth", path: "b.ts", fingerprint: graphSourceFingerprint("b") };
    const first = node("file", "combined.ts", { parent: repository.id, derivedFrom: [firstSource, secondSource] });
    const second = { ...first, derivedFrom: [secondSource, firstSource] };
    expect(buildIdentityGraph({ workspace, nodes: [repository, first], edges: [] }).version.fingerprint)
      .toBe(buildIdentityGraph({ workspace, nodes: [second, repository], edges: [] }).version.fingerprint);
  });
});
