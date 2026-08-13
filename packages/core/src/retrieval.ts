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

/** Standard BM25 (k1=1.2, b=0.75) over the scanner's code-only candidate corpus. */
export function rankByBm25(files: RepoFile[], task: string, limit = 5): string[] {
  const candidates = files.filter((file) => file.isSource && !file.isTest && file.kind === "code");
  const terms = retrievalQueryTerms(task);
  const documents = candidates.map((file) => {
    const counts = new Map<string, number>();
    for (const token of retrievalTokens(`${file.path}\n${file.textSample}`)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return { path: file.path, counts, length: [...counts.values()].reduce((sum, count) => sum + count, 0) };
  });
  if (documents.length === 0 || terms.length === 0) return [];
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const documentFrequency = new Map(terms.map((term) => [
    term,
    documents.reduce((count, document) => count + (document.counts.has(term) ? 1 : 0), 0)
  ]));

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
      return { path: document.path, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.path);
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
