import { extractLanguageDefinitions } from "./language-adapters.js";
import type { RepoFile } from "./types.js";

const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being
below between both but by can cannot could did do does doing down during each few for from further had has have having
he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or other
ought our out over own same she should so some such than that the their them then there these they this those through
to too under until up very was we were what when where which while who whom why with would you your
bug issue issues error errors expected actual behavior behaviour reproduce reproduction steps version versions node npm
report repo repository description example code please thanks title type severity confidence location line lines
following above below see also would should could may might must will can also using used use uses`.split(/\s+/));
const PATH_BOUNDARY = /[A-Za-z0-9_/-]/;
const REPO_ROOT_ANCHOR = /(?:\/(?:blob|tree|blame|raw)\/[^\s/]+\/|raw\.githubusercontent\.com\/[^\s/]+\/[^\s/]+\/[^\s/]+\/)$/i;

export function retrievalTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.match(/[A-Za-z0-9_$]+/g) ?? []) {
    const lower = raw.toLowerCase();
    if (lower.length >= 3) tokens.push(lower);
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])|_/).filter((part) => part.length >= 3);
    if (parts.length > 1) tokens.push(...parts.map((part) => part.toLowerCase()));
  }
  return tokens;
}

export function retrievalQueryTerms(task: string): string[] {
  return [...new Set(retrievalTokens(task))].filter((term) => !STOPWORDS.has(term));
}

export type RetrievalQueryExpansion = {
  term: string;
  source: string;
  rule: "technical-alias" | "inflection";
};

export type RetrievalQuery = {
  originalTerms: string[];
  terms: string[];
  expansions: RetrievalQueryExpansion[];
};

export type Bm25RankedDocument = {
  id: string;
  score: number;
  rank: number;
};

export type SymbolRetrievalHit = Bm25RankedDocument & {
  path: string;
  symbol: string;
  kind: string;
};

const TECHNICAL_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  auth: ["authentication"],
  authentication: ["auth"],
  cli: ["commandline"],
  commandline: ["cli"],
  config: ["configuration"],
  configuration: ["config"],
  db: ["database"],
  database: ["db"],
  env: ["environment"],
  environment: ["env"],
  ui: ["interface"],
  interface: ["ui"]
});

/**
 * Expands only reversible technical aliases and simple English inflections. The original
 * terms remain separately inspectable so callers never have to guess what FixMap inferred.
 */
export function buildRetrievalQuery(task: string): RetrievalQuery {
  const originalTerms = retrievalQueryTerms(task);
  const seen = new Set(originalTerms);
  const expansions: RetrievalQueryExpansion[] = [];
  const add = (term: string, source: string, rule: RetrievalQueryExpansion["rule"]) => {
    if (term.length < 3 || STOPWORDS.has(term) || seen.has(term)) return;
    seen.add(term);
    expansions.push({ term, source, rule });
  };

  for (const source of originalTerms) {
    const aliases = Object.hasOwn(TECHNICAL_ALIASES, source) ? TECHNICAL_ALIASES[source] ?? [] : [];
    for (const alias of aliases) add(alias, source, "technical-alias");
    if (source.endsWith("ies") && source.length > 5) add(`${source.slice(0, -3)}y`, source, "inflection");
    else if (source.endsWith("s") && !source.endsWith("ss") && source.length > 4) add(source.slice(0, -1), source, "inflection");
  }

  return { originalTerms, terms: [...seen], expansions };
}

/** Standard BM25 (k1=1.2, b=0.75) over the scanner's code-only candidate corpus. */
export function rankByBm25(files: RepoFile[], task: string, limit = 5): string[] {
  return rankByBm25Detailed(files, task, limit).map((entry) => entry.id);
}

/** Standard BM25 with scores and ranks retained for evidence-bearing fusion. */
export function rankByBm25Detailed(
  files: RepoFile[],
  task: string,
  limit = 5,
  eligibleKinds: ReadonlySet<RepoFile["kind"]> = new Set(["code"])
): Bm25RankedDocument[] {
  const candidates = files.filter((file) => file.isSource && !file.isTest && eligibleKinds.has(file.kind));
  return rankDocumentsByBm25(
    candidates.map((file) => ({ id: file.path, text: `${file.path}\n${file.searchTextSample ?? file.textSample}` })),
    task,
    limit
  );
}

/**
 * Retrieves definition-sized units independently from whole-file retrieval. A symbol hit
 * is mapped back to its owning file, but its symbol identity and rank remain visible.
 */
export function rankSymbolsByBm25Detailed(files: RepoFile[], task: string, limit = 50): SymbolRetrievalHit[] {
  const units = files.flatMap((file) => extractLanguageDefinitions(file).map((definition, index) => {
    const searchText = file.searchTextSample ?? file.textSample;
    const offset = definition.offset ?? searchText.indexOf(definition.name);
    const start = Math.max(0, offset - 500);
    const end = Math.min(searchText.length, offset + definition.name.length + 1_000);
    return {
      id: `${file.path}#${definition.name}:${index}`,
      path: file.path,
      symbol: definition.name,
      kind: definition.kind,
      text: `${file.path}\n${definition.kind} ${definition.name}\n${searchText.slice(start, end)}`
    };
  }));
  const ranked = rankDocumentsByBm25(units, task, Math.max(limit * 4, limit));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const seenPaths = new Set<string>();
  const hits: SymbolRetrievalHit[] = [];
  for (const entry of ranked) {
    const unit = byId.get(entry.id);
    if (!unit || seenPaths.has(unit.path)) continue;
    seenPaths.add(unit.path);
    hits.push({ ...entry, rank: hits.length + 1, path: unit.path, symbol: unit.symbol, kind: unit.kind });
    if (hits.length >= Math.max(0, limit)) break;
  }
  return hits;
}

export function rankDocumentsByBm25(
  inputs: readonly { id: string; text: string }[],
  task: string,
  limit = 5
): Bm25RankedDocument[] {
  const terms = buildRetrievalQuery(task).terms;
  if (inputs.length === 0 || terms.length === 0) return [];
  const queryTerms = new Set(terms);
  const documentFrequency = new Map(terms.map((term) => [term, 0]));
  const documents = inputs.map((input) => {
    const statistics = bm25DocumentStatistics(input.text, queryTerms);
    for (const term of statistics.counts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    return { id: input.id, ...statistics };
  });
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;

  return documents
    .map((document) => {
      let score = 0;
      for (const term of terms) {
        const frequency = document.counts.get(term) ?? 0;
        if (frequency === 0) continue;
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        score += idf * ((frequency * 2.2) / (frequency + 1.2 * (0.25 + (0.75 * document.length) / averageLength)));
      }
      return { id: document.id, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * BM25 needs total document length plus frequencies for query terms only. Retaining a map
 * of every token in every file/symbol made large Java repositories spend hundreds of MB on
 * vocabulary that could never affect the score. This preserves the exact token stream and
 * score while bounding retained counts by query size.
 */
function bm25DocumentStatistics(text: string, queryTerms: ReadonlySet<string>): { counts: Map<string, number>; length: number } {
  const counts = new Map<string, number>();
  let length = 0;
  const record = (token: string) => {
    length += 1;
    if (queryTerms.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  };
  for (const match of text.matchAll(/[A-Za-z0-9_$]+/g)) {
    const raw = match[0];
    const lower = raw.toLowerCase();
    if (lower.length >= 3) record(lower);
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])|_/).filter((part) => part.length >= 3);
    if (parts.length > 1) for (const part of parts) record(part.toLowerCase());
  }
  return { counts, length };
}

export function taskMentionsExpectedPath(task: string, expectedPaths: string[]): boolean {
  const normalizedTask = task.replace(/\\/g, "/").toLowerCase();
  return expectedPaths.some((expectedPath) => {
    const normalizedPath = expectedPath.replace(/\\/g, "/").toLowerCase();
    const segments = normalizedPath.split("/");
    if (findAnchoredPath(normalizedTask, normalizedPath)) return true;
    // A multi-segment suffix can identify the file while a bare basename cannot reliably do so.
    for (let start = 1; start < segments.length - 1; start += 1) {
      if (findAnchoredPath(normalizedTask, segments.slice(start).join("/"))) return true;
    }
    return false;
  });
}

function findAnchoredPath(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return false;
    const before = index === 0 ? "" : haystack[index - 1] ?? "";
    const after = haystack[index + needle.length] ?? "";
    const preceding = haystack.slice(Math.max(0, index - 200), index);
    const leftOk = !PATH_BOUNDARY.test(before) || REPO_ROOT_ANCHOR.test(preceding);
    if (leftOk && !PATH_BOUNDARY.test(after)) return true;
    from = index + 1;
  }
}
