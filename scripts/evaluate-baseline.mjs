// Baseline-relative ranking evaluation.
//
//   node scripts/evaluate-baseline.mjs                   compare arms on the regression suite
//   node scripts/evaluate-baseline.mjs --suite heldout   compare arms on the held-out suite
//   node scripts/evaluate-baseline.mjs --record          write benchmarks/<suite>/baseline-results.json
//
// FixMap publishes a hit rate with nothing beside it, which leaves the question a reader
// actually has unanswered: is this better than what an agent already gets for free by
// searching the repository itself? This script answers that by scoring naive retrieval on
// exactly the same inputs.
//
// Every arm sees ONE scanRepo() result per case — the same file list, the same text
// samples, the same truncation. Only the ranking function differs, so a difference in the
// score is a difference in ranking rather than in what was read.
//
// Arms:
//
//   path-extraction   pulls path-shaped tokens straight out of the task text and keeps
//                     the ones that resolve to a real file. Ranks nothing. Exists to
//                     price the leak: whatever this scores, the task was carrying.
//   lexical-literal   a literal keyword search, the "I ran a few greps" arm. Ranks by how
//                     many distinct query terms appear in a file, then by raw occurrence
//                     count. No corpus statistics, no weighting.
//   bm25              standard BM25 (k1=1.2, b=0.75) over the same text. This is a
//                     retrieval baseline, not a grep — it is what a competent lexical
//                     search engine does, and it is the harder bar of the two.
//   fixmap            rankContextFiles, the shipped ranker.
//
// Both keyword arms are case-insensitive and expand camelCase, which favours the
// baselines. That is deliberate: a baseline that has been handicapped proves nothing.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { materializePinnedRepository } from "./lib/external-cache.mjs";
import { classifyExpectedPathMention, splitCohorts } from "./lib/expected-path-mention.mjs";
import { wilsonInterval } from "./lib/wilson.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { scanRepo, rankContextFiles } = await import(
  pathToFileURL(join(repoRoot, "packages", "core", "dist", "index.js")).href
);

const suiteIndex = process.argv.indexOf("--suite");
const suite = suiteIndex === -1 ? "external" : process.argv[suiteIndex + 1];
if (!["external", "heldout"].includes(suite)) {
  process.stderr.write(`Unknown suite "${suite}"; expected "external" or "heldout".\n`);
  process.exit(1);
}

const suiteDir = join(repoRoot, "benchmarks", suite);
const dataset = JSON.parse(await readFile(join(suiteDir, "dataset.json"), "utf8"));

const TOP_N = 5;

// Ordinary issue-prose and Markdown scaffolding. Kept deliberately short: an aggressive
// list would be tuning the baseline, and the point of the baseline is that nobody tuned it.
const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being
below between both but by can cannot could did do does doing down during each few for from further had has have having
he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or other
ought our out over own same she should so some such than that the their them then there these they this those through
to too under until up very was we were what when where which while who whom why with would you your
bug issue issues error errors expected actual behavior behaviour reproduce reproduction steps version versions node npm
report repo repository description example code please thanks title type severity confidence location line lines
following above below see also would should could may might must will can also using used use uses`.split(/\s+/));

/** Tokenizes text for retrieval: lowercase alphanumerics plus camelCase sub-tokens. */
function tokenize(text) {
  const tokens = [];
  for (const raw of String(text).match(/[A-Za-z0-9_$]+/g) ?? []) {
    const lower = raw.toLowerCase();
    if (lower.length >= 3) {
      tokens.push(lower);
    }
    // "modifiedPaths" also yields "modified" and "paths" so a query written in prose can
    // reach an identifier written in camelCase.
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])|_/).filter((part) => part.length >= 3);
    if (parts.length > 1) {
      for (const part of parts) {
        tokens.push(part.toLowerCase());
      }
    }
  }
  return tokens;
}

/** Distinct, non-stopword query terms from the task text. No corpus statistics used. */
function queryTerms(task) {
  return [...new Set(tokenize(task))].filter((term) => !STOPWORDS.has(term));
}

/** The text each arm searches: the path plus whatever the scanner sampled of the file. */
function searchableText(file) {
  return `${file.path}\n${file.textSample ?? ""}`;
}

// Candidate policy is the confound that matters most here, and getting it wrong produces a
// strawman. FixMap does not rank the raw scan: rankContextFiles gates on
// `isSource && !isTest` (minus lockfiles, excluded and generated paths) and then penalises
// documentation for a task that is not about documentation. A baseline pointed at every
// scanned file is therefore competing on a different, larger, doc-heavy population — and it
// loses to README.md, not to FixMap.
//
// So each keyword arm is scored under three policies, and the arm's headline number is its
// BEST policy. Comparing FixMap to the strongest baseline available is the only version of
// this comparison worth publishing.
const CANDIDATE_POLICIES = {
  // Every scanned file. Kept for reference: this is the version that ranks READMEs first.
  raw: () => true,
  // FixMap's own candidate gate, using only public RepoFile fields.
  source: (file) => file.isSource && !file.isTest,
  // Additionally drops documentation, matching FixMap's deprioritisation of it for the
  // implementation tasks that make up both suites.
  code: (file) => file.isSource && !file.isTest && file.kind === "code"
};

// ---------------------------------------------------------------------------- arms

/**
 * Pulls path-shaped tokens out of the task and keeps those resolving to a real file.
 * Ranked by order of appearance. This measures how much of a score the task text is
 * carrying on its own, before any ranking happens.
 */
function rankByPathExtraction(files, task) {
  const text = String(task).replace(/\\/g, "/");
  const candidates = text.match(/[A-Za-z0-9_.$-]+(?:\/[A-Za-z0-9_.$-]+)+\.[A-Za-z0-9]+/g) ?? [];
  const byPath = new Set(files.map((file) => file.path));
  const ranked = [];
  const seen = new Set();
  for (const candidate of candidates) {
    // A candidate lifted from a GitHub permalink still carries its URL prefix
    // ("github.com/owner/repo/blob/<sha>/packages/…"), so an exact match on the whole token
    // never fires. Peel leading segments off and take the longest tail that is a real file.
    // Without this the arm silently misses every permalink, which understates exactly the
    // quantity it exists to measure.
    const segments = candidate.split("/");
    let match = null;
    for (let start = 0; start < segments.length && !match; start += 1) {
      const tail = segments.slice(start).join("/");
      if (byPath.has(tail)) {
        match = tail;
        break;
      }
      const suffixMatches = files.filter((file) => file.path.endsWith(`/${tail}`));
      if (suffixMatches.length === 1) {
        match = suffixMatches[0].path;
      }
    }
    if (match && !seen.has(match)) {
      seen.add(match);
      ranked.push(match);
    }
  }
  return ranked.slice(0, TOP_N);
}

/**
 * Literal keyword search: rank by how many distinct query terms occur in the file, then
 * by total occurrences. This is the "I ran a few greps and looked at what matched most"
 * arm — no idf, no length normalisation, no weighting.
 */
function rankByLexicalLiteral(files, terms) {
  const scored = [];
  for (const file of files) {
    const haystack = searchableText(file).toLowerCase();
    let distinct = 0;
    let total = 0;
    for (const term of terms) {
      let count = 0;
      let index = haystack.indexOf(term);
      while (index !== -1) {
        count += 1;
        index = haystack.indexOf(term, index + term.length);
      }
      if (count > 0) {
        distinct += 1;
        total += count;
      }
    }
    if (distinct > 0) {
      scored.push({ path: file.path, distinct, total });
    }
  }
  scored.sort((a, b) => b.distinct - a.distinct || b.total - a.total || a.path.localeCompare(b.path));
  return scored.slice(0, TOP_N).map((entry) => entry.path);
}

/** Standard BM25 over the same corpus. The harder of the two keyword baselines. */
function rankByBm25(files, terms, k1 = 1.2, b = 0.75) {
  const documents = files.map((file) => {
    const counts = new Map();
    for (const token of tokenize(searchableText(file))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return { path: file.path, counts, length: [...counts.values()].reduce((sum, n) => sum + n, 0) };
  });
  const total = documents.length;
  if (total === 0) {
    return [];
  }
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / total;

  const documentFrequency = new Map();
  for (const term of terms) {
    documentFrequency.set(term, documents.reduce((count, doc) => count + (doc.counts.has(term) ? 1 : 0), 0));
  }

  const scored = documents.map((doc) => {
    let score = 0;
    for (const term of terms) {
      const frequency = doc.counts.get(term) ?? 0;
      if (frequency === 0) {
        continue;
      }
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      score += idf * ((frequency * (k1 + 1)) / (frequency + k1 * (1 - b + (b * doc.length) / averageLength)));
    }
    return { path: doc.path, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b2) => b2.score - a.score || a.path.localeCompare(b2.path))
    .slice(0, TOP_N)
    .map((entry) => entry.path);
}

// ---------------------------------------------------------------------------- run

// Each baseline is run under every candidate policy; FixMap applies its own internally.
const BASELINE_ARMS = ["path-extraction", "lexical-literal", "bm25"];
const ARMS = [];
for (const arm of BASELINE_ARMS) {
  for (const policy of Object.keys(CANDIDATE_POLICIES)) {
    ARMS.push(`${arm}:${policy}`);
  }
}
ARMS.push("fixmap");

const perArmResults = Object.fromEntries(ARMS.map((arm) => [arm, []]));
const perCase = [];

for (const benchmark of dataset.cases) {
  const dir = await materializePinnedRepository(benchmark);
  // One scan, shared by every arm, so the comparison isolates ranking and candidate policy
  // rather than what was read off disk.
  const repo = await scanRepo({ repoRoot: dir });
  if (repo.files.length === 0) {
    throw new Error(`Baseline evaluation could not scan any files for ${benchmark.slug} at ${benchmark.sha}.`);
  }
  const terms = queryTerms(benchmark.task);
  const mention = classifyExpectedPathMention(benchmark);

  const ranked = {
    fixmap: rankContextFiles(repo, { issueText: benchmark.task }, TOP_N).map((file) => file.path)
  };
  const policyCounts = {};
  for (const [policy, predicate] of Object.entries(CANDIDATE_POLICIES)) {
    const files = repo.files.filter(predicate);
    policyCounts[policy] = files.length;
    ranked[`path-extraction:${policy}`] = rankByPathExtraction(files, benchmark.task);
    ranked[`lexical-literal:${policy}`] = rankByLexicalLiteral(files, terms);
    ranked[`bm25:${policy}`] = rankByBm25(files, terms);
  }

  const caseRow = {
    slug: benchmark.slug,
    expected: benchmark.expected,
    scannedFiles: repo.files.length,
    candidateCounts: policyCounts,
    queryTermCount: terms.length,
    mentionsExpectedPath: mention.mentionsExpectedPath,
    mentionTier: mention.mentionTier,
    arms: {}
  };

  for (const arm of ARMS) {
    const paths = ranked[arm];
    const row = {
      slug: benchmark.slug,
      mentionsExpectedPath: mention.mentionsExpectedPath,
      top5: paths,
      top1: benchmark.expected.includes(paths[0]),
      top3: benchmark.expected.some((path) => paths.slice(0, 3).includes(path)),
      top5Hit: benchmark.expected.some((path) => paths.includes(path))
    };
    perArmResults[arm].push(row);
    caseRow.arms[arm] = { top5: paths, top1: row.top1, top3: row.top3, top5Hit: row.top5Hit };
  }
  perCase.push(caseRow);
}

function scoreCohort(cohort) {
  const hitRate = (key) =>
    cohort.length === 0 ? null : Number((cohort.filter((result) => result[key]).length / cohort.length).toFixed(3));
  const interval = (key) => wilsonInterval(cohort.filter((result) => result[key]).length, cohort.length);
  return {
    cases: cohort.length,
    top1HitRate: hitRate("top1"),
    top3HitRate: hitRate("top3"),
    top5HitRate: hitRate("top5Hit"),
    intervals95: { top1: interval("top1"), top3: interval("top3"), top5: interval("top5Hit") }
  };
}

// Comparing two Wilson intervals is the wrong test here and it understates the evidence:
// the arms ran on the SAME cases, so the pairing carries information that two independent
// intervals throw away. McNemar's exact test looks only at cases where the two arms
// disagreed, which is where all the signal is. It stays valid at these sample sizes; what
// small n costs is power, so a significant result remains meaningful while a
// non-significant one is genuinely inconclusive rather than negative.
function mcnemarExact(rowsA, rowsB, key) {
  let aWins = 0;
  let bWins = 0;
  for (let index = 0; index < rowsA.length; index += 1) {
    if (rowsA[index][key] && !rowsB[index][key]) aWins += 1;
    else if (!rowsA[index][key] && rowsB[index][key]) bWins += 1;
  }
  const discordant = aWins + bWins;
  if (discordant === 0) {
    return { aWins, bWins, discordant, pValue: null };
  }
  const choose = (n, k) => {
    let value = 1;
    for (let i = 1; i <= k; i += 1) value = (value * (n - k + i)) / i;
    return value;
  };
  let tail = 0;
  for (let i = 0; i <= Math.min(aWins, bWins); i += 1) {
    tail += choose(discordant, i) * Math.pow(0.5, discordant);
  }
  return { aWins, bWins, discordant, pValue: Number(Math.min(1, 2 * tail).toFixed(4)) };
}

const arms = {};
for (const arm of ARMS) {
  const cohorts = splitCohorts(perArmResults[arm]);
  arms[arm] = {
    all: scoreCohort(cohorts.all),
    unmentioned: scoreCohort(cohorts.unmentioned),
    mentioned: scoreCohort(cohorts.mentioned)
  };
}

// The comparison worth publishing is against the STRONGEST form of each baseline, not the
// weakest. For every baseline family, pick the candidate policy that scored best on the
// unmentioned cohort and treat that as the arm to beat.
const bestPolicyPerFamily = {};
for (const family of BASELINE_ARMS) {
  let best = null;
  for (const policy of Object.keys(CANDIDATE_POLICIES)) {
    const score = arms[`${family}:${policy}`].unmentioned;
    const key = [score.top1HitRate ?? 0, score.top3HitRate ?? 0, score.top5HitRate ?? 0];
    if (!best || key > best.key) {
      best = { policy, key };
    }
  }
  bestPolicyPerFamily[family] = best.policy;
}

// FixMap against each baseline family's best policy, on the cohort the claim rests on.
const pairedVsFixmap = {};
for (const cohortName of ["all", "unmentioned"]) {
  const pick = (arm) => splitCohorts(perArmResults[arm])[cohortName];
  const fixmapRows = pick("fixmap");
  pairedVsFixmap[cohortName] = Object.fromEntries(
    BASELINE_ARMS.map((family) => {
      const arm = `${family}:${bestPolicyPerFamily[family]}`;
      return [
        arm,
        {
          top1: mcnemarExact(fixmapRows, pick(arm), "top1"),
          top3: mcnemarExact(fixmapRows, pick(arm), "top3"),
          top5: mcnemarExact(fixmapRows, pick(arm), "top5Hit")
        }
      ];
    })
  );
}

const summary = {
  suite,
  cases: dataset.cases.length,
  configuration: {
    topN: TOP_N,
    corpus: "one scanRepo() result per case, shared by every arm",
    searchField: "file path + scanner text sample (files over the scanner's sample limit are truncated for every arm alike)",
    tokenizer: "lowercase [A-Za-z0-9_$]+ of length >= 3, plus camelCase and underscore sub-tokens",
    stopwords: STOPWORDS.size,
    caseSensitivity: "case-insensitive for both keyword arms, which favours the baselines",
    bm25: { k1: 1.2, b: 0.75 },
    candidatePolicies: {
      raw: "every scanned file; ranks READMEs first and is not a fair comparison",
      source: "isSource && !isTest — FixMap's own candidate gate",
      code: "isSource && !isTest && kind === 'code' — also drops documentation, as FixMap's scoring effectively does for implementation tasks"
    },
    bestPolicyPerFamily,
    armDescriptions: {
      "path-extraction": "path-shaped tokens read out of the task text, resolved against the corpus, ranked by order of appearance",
      "lexical-literal": "literal keyword search ranked by distinct query terms matched, then raw occurrence count",
      bm25: "BM25 retrieval over the same text; a retrieval baseline, not a grep",
      fixmap: "rankContextFiles from @aryam/fixmap-core, which applies its own candidate gate internally"
    }
  },
  arms,
  // aWins counts cases FixMap got and the baseline missed; bWins the reverse.
  pairedVsFixmapMcnemarExact: pairedVsFixmap,
  results: perCase
};

const rendered = `${JSON.stringify(summary, null, 2)}\n`;
process.stdout.write(rendered);

if (process.argv.includes("--record")) {
  await writeFile(join(suiteDir, "baseline-results.json"), rendered, "utf8");
}
