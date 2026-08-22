import { buildImportGraph } from "./import-graph.js";
import { isFixMapArtifact } from "./artifacts.js";
import { isBackupPath, isGeneratedPath } from "./paths.js";
import type {
  ImpactEvidence,
  ImpactFile,
  ImpactMap,
  RepoMap,
  TestRoute
} from "./types.js";

const DEFAULT_IMPACT_LIMIT = 12;
const MAX_IMPACT_SEEDS = 3;
const MIN_CO_CHANGE_OCCURRENCES = 2;

type Candidate = {
  path: string;
  score: number;
  evidence: ImpactEvidence[];
};

/**
 * Builds a separate impact view instead of smuggling relationship evidence into the task
 * ranking. A task match answers "where should I start?"; this answers "what should I inspect
 * around that start?". Keeping both lists explicit prevents a historical companion from
 * masquerading as a file named by the task.
 */
export function buildImpactMap(
  repo: RepoMap,
  requestedSeeds: string[],
  testRoutes: TestRoute[] = [],
  limit = DEFAULT_IMPACT_LIMIT
): ImpactMap {
  const repositoryPaths = new Set(repo.files.filter((file) => !isFixMapArtifact(file)).map((file) => file.path));
  const seeds = [...new Set(requestedSeeds)]
    .filter((path) => repositoryPaths.has(path))
    .slice(0, MAX_IMPACT_SEEDS);
  const seedSet = new Set(seeds);
  const candidates = new Map<string, Candidate>();

  const addEvidence = (path: string, score: number, evidence: ImpactEvidence): void => {
    if (seedSet.has(path) || !repositoryPaths.has(path) || isGeneratedPath(path) || isBackupPath(path)) return;
    const current = candidates.get(path) ?? { path, score: 0, evidence: [] };
    if (!current.evidence.some((entry) => entry.kind === evidence.kind && entry.seed === evidence.seed)) {
      current.evidence.push(evidence);
      current.score += score;
    }
    candidates.set(path, current);
  };

  const graph = buildImportGraph(repo.files);
  for (const seed of seeds) {
    for (const imported of [...(graph.imports.get(seed) ?? [])].sort((a, b) => a.localeCompare(b))) {
      addEvidence(imported, 4, {
        kind: "imports",
        seed,
        reason: `${seed} imports this file`
      });
    }
    for (const importer of [...(graph.importedBy.get(seed) ?? [])].sort((a, b) => a.localeCompare(b))) {
      addEvidence(importer, 6, {
        kind: "imported-by",
        seed,
        reason: `this file imports ${seed}`
      });
    }
  }

  for (const route of testRoutes.filter((entry) => entry.kind === "test")) {
    for (const path of route.relatedFiles) {
      const seed = nearestSeed(path, seeds) ?? seeds[0];
      if (!seed) continue;
      addEvidence(path, 7, {
        kind: "test-route",
        seed,
        reason: `routed test for ${seed} via ${route.command}`
      });
    }
  }

  const history = repo.history;
  if (history) {
    for (const seed of seeds) {
      const seedCommits = history.commits.filter((commit) => commit.files.includes(seed));
      const coOccurrences = new Map<string, number>();
      for (const commit of seedCommits) {
        for (const path of commit.files) {
          if (path !== seed && repositoryPaths.has(path)) {
            coOccurrences.set(path, (coOccurrences.get(path) ?? 0) + 1);
          }
        }
      }
      for (const [path, occurrences] of coOccurrences) {
        if (occurrences < MIN_CO_CHANGE_OCCURRENCES) continue;
        const strength = occurrences / Math.max(seedCommits.length, 1);
        const score = Math.min(8, 2 + Math.round(strength * 6));
        addEvidence(path, score, {
          kind: "co-change",
          seed,
          reason:
            `changed alongside ${seed} in ${occurrences} of its ${seedCommits.length} eligible ` +
            `${seedCommits.length === 1 ? "change" : "changes"}`,
          occurrences,
          seedChanges: seedCommits.length
        });
      }
    }
  }

  const files = [...candidates.values()]
    .map(toImpactFile)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, Math.max(0, limit));

  return {
    seeds,
    files,
    inspectionOrder: [...seeds, ...files.map((file) => file.path)],
    history: {
      available: Boolean(history),
      eligibleCommits: history?.commits.length ?? 0,
      shallow: history?.shallow ?? false,
      truncated: history?.truncated ?? false
    }
  };
}

function toImpactFile(candidate: Candidate): ImpactFile {
  const kinds = new Set(candidate.evidence.map((entry) => entry.kind));
  const strongestCoChange = candidate.evidence
    .filter((entry) => entry.kind === "co-change")
    .reduce((best, entry) => Math.max(best, (entry.occurrences ?? 0) / Math.max(entry.seedChanges ?? 1, 1)), 0);
  const confidence: ImpactFile["confidence"] =
    kinds.has("test-route") || kinds.size >= 2 || strongestCoChange >= 0.6
      ? "high"
      : kinds.has("imported-by") || kinds.has("imports") || strongestCoChange >= 0.3
        ? "medium"
        : "low";
  return {
    path: candidate.path,
    score: candidate.score,
    confidence,
    evidence: candidate.evidence.sort((left, right) => left.kind.localeCompare(right.kind) || left.seed.localeCompare(right.seed))
  };
}

function nearestSeed(path: string, seeds: string[]): string | undefined {
  const pathParts = path.split("/");
  return [...seeds]
    .map((seed) => {
      const seedParts = seed.split("/");
      let common = 0;
      while (common < pathParts.length && common < seedParts.length && pathParts[common] === seedParts[common]) common += 1;
      return { seed, common };
    })
    .sort((left, right) => right.common - left.common || left.seed.localeCompare(right.seed))[0]?.seed;
}
