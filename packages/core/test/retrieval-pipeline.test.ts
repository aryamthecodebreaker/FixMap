import { describe, expect, it } from "vitest";
import { rankContextFilesEvidenceDetailed, selectEvidenceProfiles, type RetrievalEvidenceProfile } from "../src/rank.js";
import { buildRetrievalQuery, rankSymbolsByBm25Detailed } from "../src/retrieval.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    extension: /\.[^.]+$/.exec(path)?.[0] ?? "",
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: "code",
    textSample
  };
}

function repo(files: RepoFile[]): RepoMap {
  return {
    root: "/repo",
    files,
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: []
  };
}

describe("evidence retrieval pipeline", () => {
  it("uses the reserved tail slot for exceptional retrieval consensus before structural coverage", () => {
    const profile = (
      path: string,
      fusionScore: number,
      evidence: Partial<RetrievalEvidenceProfile> = {}
    ): RetrievalEvidenceProfile => ({
      path,
      intent: "implementation",
      tier: "corroborated",
      direct: false,
      queryExpansions: [],
      fusionScore,
      ...evidence
    });
    const prefix = [1, 2, 3, 4].map((rank) => profile(`src/leader-${rank}.ts`, 110 - rank, {
      structuralRank: rank,
      lexicalRank: rank + 10,
      symbolRank: rank + 10
    }));
    const structuralCoverage = profile("src/structural.ts", 90, {
      direct: true,
      tier: "direct",
      structuralRank: 5,
      lexicalRank: 40,
      symbolRank: 40
    });
    const strongConsensus = profile("src/consensus.ts", 45, {
      structuralRank: 9,
      lexicalRank: 2,
      symbolRank: 1
    });

    expect(selectEvidenceProfiles([...prefix, structuralCoverage, strongConsensus], 5).at(-1)?.path)
      .toBe("src/consensus.ts");
  });

  it("falls back to direct structural coverage when independent consensus is weak", () => {
    const profiles: RetrievalEvidenceProfile[] = [
      ...[1, 2, 3, 4].map((rank) => ({
        path: `src/leader-${rank}.ts`, intent: "implementation" as const,
        tier: "corroborated" as const, direct: false, structuralRank: rank,
        lexicalRank: rank + 10, symbolRank: rank + 10, queryExpansions: [], fusionScore: 110 - rank
      })),
      {
        path: "src/structural.ts", intent: "implementation", tier: "direct", direct: true,
        structuralRank: 5, lexicalRank: 44, symbolRank: 15, queryExpansions: [], fusionScore: 90
      }
    ];

    expect(selectEvidenceProfiles(profiles, 5).at(-1)?.path).toBe("src/structural.ts");
  });

  it("retrieves a symbol from a large file's distributed search sample", () => {
    const large = repo([{
      path: "src/routing.py", extension: ".py", sizeBytes: 200_000,
      isTest: false, isSource: true, kind: "code",
      textSample: "def ordinary_route():\n    pass\n",
      searchTextSample: "def ordinary_route():\n    pass\n\ndef server_sent_event_disconnect():\n    pass\n",
      textSampleComplete: false, textSampleSkipReason: "too-large"
    }]);

    const result = rankContextFilesEvidenceDetailed(large, { issueText: "server sent event disconnect handling" }, 5);

    expect(result.contextFiles[0]?.path).toBe("src/routing.py");
    expect(result.contextFiles[0]?.retrieval?.symbolRank).toBe(1);
  });

  it("keeps tokenizer aliases reachable through the structural prefix gate", () => {
    const result = rankContextFilesEvidenceDetailed(repo([
      file("src/styles.ts", "const syntax = 'SCSS'; const protocol = 'HTTP / 2';"),
      file("src/other.ts", "export const unrelated = true;")
    ]), { issueText: "css h2 support" }, 2);

    expect(result.contextFiles[0]?.path).toBe("src/styles.ts");
    expect(result.contextFiles[0]?.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining("content matches task terms")
    ]));
  });

  it("retrieves definition-sized units and maps them to owning files", () => {
    const hits = rankSymbolsByBm25Detailed([
      file("src/account.ts", "export function loadAccount() { return true; }"),
      file("src/session.ts", "export function renewSessionToken() { return true; }")
    ], "session token renewal", 5);

    expect(hits[0]).toMatchObject({
      path: "src/session.ts",
      symbol: "renewSessionToken",
      rank: 1
    });
  });

  it("unions independent sources and exposes the evidence used to rerank", () => {
    const result = rankContextFilesEvidenceDetailed(repo([
      file("src/controller.ts", "import { renewSessionToken } from './session.js'; session token renewal"),
      file("src/session.ts", "export function renewSessionToken() { return true; }"),
      file("src/unrelated.ts", "export function renderAvatar() { return true; }")
    ]), { issueText: "session token renewal stops working" }, 5);

    const session = result.profiles.find((profile) => profile.path === "src/session.ts");
    expect(session).toMatchObject({
      path: "src/session.ts",
      tier: "corroborated",
      lexicalRank: expect.any(Number),
      symbolRank: 1,
      symbol: "renewSessionToken"
    });
    expect(result.contextFiles.find((entry) => entry.path === "src/session.ts")?.reasons)
      .toContain("corroborated by independent retrieval sources");
  });

  it("records conservative query expansion provenance without replacing original terms", () => {
    const query = buildRetrievalQuery("auth configs fail");

    expect(query.originalTerms).toEqual(expect.arrayContaining(["auth", "configs"]));
    expect(query.terms).toEqual(expect.arrayContaining(["auth", "authentication", "config"]));
    expect(query.expansions).toEqual(expect.arrayContaining([
      { source: "auth", term: "authentication", rule: "technical-alias" },
      { source: "configs", term: "config", rule: "inflection" }
    ]));
  });

  it("treats Object prototype names as ordinary query terms", () => {
    expect(buildRetrievalQuery("constructor prototype failure")).toMatchObject({
      originalTerms: expect.arrayContaining(["constructor", "prototype"]),
      terms: expect.arrayContaining(["constructor", "prototype"])
    });
  });
});
