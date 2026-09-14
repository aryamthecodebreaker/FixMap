import { rankContextFilesEvidenceDetailed } from "./rank.js";
import { isFixMapArtifact } from "./artifacts.js";
import type { PathExcluder } from "./exclude.js";
import type { RankedFile, RepoMap, ScanDiagnostic } from "./types.js";
import type { RankingShape } from "./grounding.js";

export type EmbeddingNormalization = "l2" | "none";

export type EmbeddingProviderProvenance = {
  id: string;
  version: string;
  model: string;
  /** SHA-256 of the local model artifact or immutable model bundle manifest. */
  artifactHash: string;
  runtime: string;
  dimensions: number;
  normalization: EmbeddingNormalization;
  local: boolean;
};

export type EmbeddingProvider = EmbeddingProviderProvenance & {
  embed(texts: readonly string[], context: { signal: AbortSignal }): Promise<readonly (readonly number[])[]>;
};

export type HybridRetrievalSignal = {
  structuralRank?: number;
  structuralScore?: number;
  lexicalRank?: number;
  symbolRank?: number;
  semanticRank?: number;
  semanticSimilarity?: number;
};

export type HybridRankedFile = RankedFile & {
  /** Weighted reciprocal-rank-fusion score. This is not the structural score. */
  fusionScore: number;
  retrieval: HybridRetrievalSignal;
};

export type SemanticIndexProvenance = EmbeddingProviderProvenance & {
  cacheKey: string;
  indexedFiles: number;
  truncatedFiles: number;
};

export type HybridRetrievalDiagnostic = {
  code:
    | "semantic-disabled"
    | "semantic-remote-disallowed"
    | "semantic-provider-invalid"
    | "semantic-provider-failed"
    | "semantic-candidates-truncated";
  severity: "info" | "warning";
  message: string;
};

export type HybridRankingResult = {
  files: HybridRankedFile[];
  mode: "structural-lexical" | "structural-lexical-semantic";
  weights: { structural: number; lexical: number; semantic: number; reciprocalRankConstant: number };
  semantic?: SemanticIndexProvenance;
  diagnostics: HybridRetrievalDiagnostic[];
  structuralDiagnostics: ScanDiagnostic[];
  structuralRanking: RankingShape;
};

export type HybridRankingOptions = {
  embeddingProvider?: EmbeddingProvider;
  allowRemoteEmbeddings?: boolean;
  exclude?: PathExcluder;
  limit?: number;
  minStructuralScore?: number;
  maxSemanticCandidates?: number;
  timeoutMs?: number;
  weights?: Partial<Pick<HybridRankingResult["weights"], "structural" | "lexical" | "semantic">>;
};

const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA_256 = /^[a-f0-9]{64}$/;
const DEFAULT_LIMIT = 8;
const DEFAULT_MAX_SEMANTIC_CANDIDATES = 1_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_WEIGHTS = {
  structural: 3,
  lexical: 1,
  semantic: 3.5,
  reciprocalRankConstant: 60
} as const;

/**
 * Combines FixMap's structural rank, BM25, and an optional embedding provider using
 * weighted reciprocal-rank fusion. Raw score scales never mix: every contribution records
 * its source rank, and semantic similarity remains separately inspectable.
 */
export async function rankContextFilesHybrid(
  repo: RepoMap,
  input: { issueText?: string | undefined; diffText?: string | undefined },
  options: HybridRankingOptions = {}
): Promise<HybridRankingResult> {
  const limit = positiveInteger(options.limit, DEFAULT_LIMIT);
  const weights = {
    structural: positiveNumber(options.weights?.structural, DEFAULT_WEIGHTS.structural),
    lexical: positiveNumber(options.weights?.lexical, DEFAULT_WEIGHTS.lexical),
    semantic: positiveNumber(options.weights?.semantic, DEFAULT_WEIGHTS.semantic),
    reciprocalRankConstant: DEFAULT_WEIGHTS.reciprocalRankConstant
  };
  const detailed = rankContextFilesEvidenceDetailed(
    repo,
    { ...input, exclude: options.exclude },
    Number.MAX_SAFE_INTEGER,
    options.minStructuralScore ?? Number.NEGATIVE_INFINITY
  );
  // Evidence ranking already performs the structural pass and retains every candidate at
  // this unbounded limit. Reusing it avoids a second full graph/grounding/scoring traversal.
  const structuralByPath = new Map(detailed.structuralFiles.map((file) => [file.path, file]));
  const evidenceByPath = new Map(detailed.contextFiles.map((file) => [file.path, file]));
  const task = [input.issueText ?? "", input.diffText ?? ""].filter(Boolean).join("\n");
  const signals = new Map<string, HybridRetrievalSignal>();
  detailed.profiles.forEach((profile) => {
    signals.set(profile.path, {
      ...(profile.structuralRank === undefined ? {} : {
        structuralRank: profile.structuralRank,
        structuralScore: profile.structuralScore
      }),
      ...(profile.lexicalRank === undefined ? {} : { lexicalRank: profile.lexicalRank }),
      ...(profile.symbolRank === undefined ? {} : { symbolRank: profile.symbolRank })
    });
  });

  const diagnostics: HybridRetrievalDiagnostic[] = [];
  let semantic: SemanticIndexProvenance | undefined;
  const provider = options.embeddingProvider;
  if (!provider) {
    diagnostics.push({
      code: "semantic-disabled",
      severity: "info",
      message: "Semantic retrieval was not configured; ranking used structural and lexical evidence only."
    });
  } else if (!provider.local && options.allowRemoteEmbeddings !== true) {
    diagnostics.push({
      code: "semantic-remote-disallowed",
      severity: "warning",
      message: `Embedding provider ${provider.id} is remote; source upload remains disabled unless explicitly allowed.`
    });
  } else {
    const providerError = validateProvider(provider);
    if (providerError) {
      diagnostics.push({ code: "semantic-provider-invalid", severity: "warning", message: providerError });
    } else if (task.trim() && detailed.contextFiles.length > 0) {
      const maxCandidates = positiveInteger(options.maxSemanticCandidates, DEFAULT_MAX_SEMANTIC_CANDIDATES);
      const semanticCandidates = repo.files
        .filter((file) =>
          file.isSource && !file.isTest && file.kind === "code" &&
          !isFixMapArtifact(file) &&
          !(options.exclude?.excludes(file.path) ?? false)
        )
        .sort((left, right) => left.path.localeCompare(right.path))
        .slice(0, maxCandidates);
      const semanticEligibleCount = repo.files.filter((file) =>
        file.isSource && !file.isTest && file.kind === "code" &&
        !isFixMapArtifact(file) &&
        !(options.exclude?.excludes(file.path) ?? false)
      ).length;
      const truncatedFiles = semanticEligibleCount - semanticCandidates.length;
      if (truncatedFiles > 0) {
        diagnostics.push({
          code: "semantic-candidates-truncated",
          severity: "warning",
          message: `Semantic retrieval embedded ${semanticCandidates.length.toLocaleString()} candidates and omitted ${truncatedFiles.toLocaleString()} lower structural candidates.`
        });
      }
      try {
        const vectors = await embedWithTimeout(
          provider,
          [task, ...semanticCandidates.map((file) => semanticDocument(repo, file.path))],
          positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS)
        );
        const query = vectors[0]!;
        const semanticScores = semanticCandidates.map((file, index) => ({
          path: file.path,
          similarity: cosineSimilarity(query, vectors[index + 1]!)
        }))
          // Rank fusion must not turn an unrelated or negatively related vector into
          // evidence merely because every indexed document receives an ordinal position.
          .filter((entry) => entry.similarity > 0)
          .sort((a, b) => b.similarity - a.similarity || a.path.localeCompare(b.path));
        semanticScores.forEach((entry, index) => {
          const signal = signals.get(entry.path) ?? {};
          signal.semanticRank = index + 1;
          signal.semanticSimilarity = round(entry.similarity, 6);
          signals.set(entry.path, signal);
        });
        semantic = {
          id: provider.id,
          version: provider.version,
          model: provider.model,
          artifactHash: provider.artifactHash,
          runtime: provider.runtime,
          dimensions: provider.dimensions,
          normalization: provider.normalization,
          local: provider.local,
          cacheKey: semanticCacheKey(provider),
          indexedFiles: semanticCandidates.length,
          truncatedFiles
        };
      } catch (error) {
        diagnostics.push({
          code: "semantic-provider-failed",
          severity: "warning",
          message: `Semantic retrieval failed without aborting FixMap: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  const fused = [...signals.entries()].flatMap(([path, signal]): HybridRankedFile[] => {
    const file = evidenceByPath.get(path) ?? structuralByPath.get(path);
    if (!file) return [];
    const fusionScore =
      reciprocalContribution(signal.structuralRank, weights.structural, weights.reciprocalRankConstant) +
      reciprocalContribution(signal.lexicalRank, weights.lexical, weights.reciprocalRankConstant) +
      reciprocalContribution(signal.symbolRank, weights.lexical, weights.reciprocalRankConstant) +
      reciprocalContribution(signal.semanticRank, weights.semantic, weights.reciprocalRankConstant);
    const reasons = [...file.reasons];
    if (signal.lexicalRank !== undefined) reasons.push(`BM25 lexical rank #${signal.lexicalRank}`);
    if (signal.semanticRank !== undefined && signal.semanticSimilarity !== undefined && semantic) {
      reasons.push(`semantic rank #${signal.semanticRank} (cosine ${signal.semanticSimilarity.toFixed(3)}) via ${semantic.id}/${semantic.model}`);
    }
    return [{ ...file, fusionScore: round(fusionScore, 8), retrieval: signal, reasons }];
  }).sort((a, b) =>
    Number(isFusionAnchor(b)) - Number(isFusionAnchor(a)) ||
    b.fusionScore - a.fusionScore ||
    (a.retrieval.structuralRank ?? Number.MAX_SAFE_INTEGER) - (b.retrieval.structuralRank ?? Number.MAX_SAFE_INTEGER) ||
    a.path.localeCompare(b.path)
  ).slice(0, limit).map((file, index) => ({ ...file, rank: index + 1 }));

  return {
    files: fused,
    mode: semantic ? "structural-lexical-semantic" : "structural-lexical",
    weights,
    ...(semantic ? { semantic } : {}),
    diagnostics,
    structuralDiagnostics: detailed.diagnostics,
    structuralRanking: detailed.ranking
  };
}

/** Direct repository evidence cannot be displaced by a similarity-only match. */
function isFusionAnchor(file: Pick<HybridRankedFile, "reasons">): boolean {
  return file.reasons.some((reason) =>
    reason === "changed file" ||
    reason === "explicitly named in the task" ||
    reason.startsWith("defines task identifiers:") ||
    reason.startsWith("exact task literal at definition:")
  );
}

function validateProvider(provider: EmbeddingProvider): string | undefined {
  if (!PROVIDER_ID.test(provider.id) || !provider.version.trim() || !provider.model.trim() || !provider.runtime.trim()) {
    return "Embedding provider identity, version, model, or runtime is invalid.";
  }
  if (!SHA_256.test(provider.artifactHash)) return `Embedding provider ${provider.id} must declare a lowercase SHA-256 artifact hash.`;
  if (!Number.isSafeInteger(provider.dimensions) || provider.dimensions < 1 || provider.dimensions > 65_536) {
    return `Embedding provider ${provider.id} declares invalid dimensions.`;
  }
  if (provider.normalization !== "l2" && provider.normalization !== "none") {
    return `Embedding provider ${provider.id} declares invalid normalization.`;
  }
  return undefined;
}

async function embedWithTimeout(
  provider: EmbeddingProvider,
  texts: readonly string[],
  timeoutMs: number
): Promise<number[][]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`embedding provider timed out after ${timeoutMs.toLocaleString()} ms`));
      }, timeoutMs);
    });
    const output = await Promise.race([provider.embed(texts, { signal: controller.signal }), timeout]);
    if (!Array.isArray(output) || output.length !== texts.length) {
      throw new Error(`embedding provider returned ${Array.isArray(output) ? output.length : "invalid"} vectors for ${texts.length} texts`);
    }
    return output.map((vector, index) => validateVector(vector, provider, index));
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

function validateVector(vector: readonly number[], provider: EmbeddingProvider, index: number): number[] {
  if (!Array.isArray(vector) && !ArrayBuffer.isView(vector)) {
    throw new Error(`embedding vector ${index} is not an array`);
  }
  const values = Array.from(vector);
  if (values.length !== provider.dimensions || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`embedding vector ${index} does not contain ${provider.dimensions} finite dimensions`);
  }
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) throw new Error(`embedding vector ${index} has zero magnitude`);
  if (provider.normalization === "l2" && Math.abs(magnitude - 1) > 0.01) {
    throw new Error(`embedding vector ${index} is not L2-normalized as declared`);
  }
  return provider.normalization === "l2" ? values : values.map((value) => value / magnitude);
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function semanticDocument(repo: RepoMap, path: string): string {
  const file = repo.files.find((candidate) => candidate.path === path);
  return `${path}\n${file?.searchTextSample ?? file?.textSample ?? ""}`.slice(0, 16_000);
}

function reciprocalContribution(rank: number | undefined, weight: number, constant: number): number {
  return rank === undefined ? 0 : weight / (constant + rank);
}

function semanticCacheKey(provider: EmbeddingProviderProvenance): string {
  return [provider.id, provider.version, provider.model, provider.artifactHash, provider.runtime,
    provider.dimensions, provider.normalization].join(":");
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
