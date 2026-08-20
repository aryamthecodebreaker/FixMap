import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const protocolPath = join(root, "benchmarks", "agent-study", "protocol.json");
const manifestPath = join(root, "benchmarks", "agent-study", "tasks.json");
const protocolBytes = await readFile(protocolPath);
const manifestBytes = await readFile(manifestPath);
const protocol = JSON.parse(protocolBytes.toString("utf8"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const requiredArms = ["baseline", "fixmap-available", "fixmap-instructed", "fixmap-impact"];
const requiredMetrics = [
  "runStatus", "failureReason",
  "taskResolved", "correctFileInFirstThreeOpened", "toolCallsToFirstRelevantFile",
  "filesOpenedBeforeFirstEdit", "incorrectFilesEdited", "totalToolCalls", "inputTokens",
  "cachedInputTokens", "outputTokens", "reasoningTokens", "totalTokens", "modelCostUsd",
  "turns", "repositorySearchCalls", "filesRead", "sourceBytesRead", "wallClockMs",
  "testsSelectedCorrectly", "finalPatchAccepted", "fixmapPlanUsed", "verifyUsefulWarnings"
];
const requiredRequirements = [
  "sameGlobalModelVersion", "sameTaskText", "sameRepositoryRevision", "uniqueContextIdPerRun",
  "uniqueArmOrderPerTask", "fixedTimeoutAndBudget", "noFixMapChangesMidStudy",
  "rawTranscriptsRequired", "transcriptContentHashVerified", "taskManifestFrozen",
  "completeTaskArmCrossProduct", "taskTextMatchesManifest", "taskSuccessRubricIdRecorded",
  "providerReportedTokenCountersOnly", "priceSheetIdRecorded", "failuresRetained"
];
const identityFields = [
  "studyId", "taskId", "taskText", "taskTextSha256", "arm", "runOrder", "model",
  "modelVersion", "fixmapRevision", "repository", "revision", "environmentId", "contextId", "timeoutMs",
  "budgetId", "rubricId", "priceSheetId", "tokenAccountingSource", "transcript", "transcriptSha256"
];
const booleanMetrics = [
  "taskResolved", "correctFileInFirstThreeOpened", "testsSelectedCorrectly",
  "finalPatchAccepted", "fixmapPlanUsed", "verifyUsefulWarnings"
];
const numericMetrics = [
  "toolCallsToFirstRelevantFile", "filesOpenedBeforeFirstEdit", "incorrectFilesEdited",
  "totalToolCalls", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens",
  "totalTokens", "modelCostUsd", "turns", "repositorySearchCalls", "filesRead",
  "sourceBytesRead", "wallClockMs"
];
const runStatuses = ["completed", "failed", "timed-out"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};

if (protocol.protocolVersion !== 3 || protocol.status !== "frozen-no-runs" ||
  protocol.taskManifest !== "benchmarks/agent-study/tasks.json" ||
  JSON.stringify(protocol.arms) !== JSON.stringify(requiredArms) ||
  requiredMetrics.some((metric) => !protocol.metrics.includes(metric)) ||
  requiredRequirements.some((requirement) => protocol.requirements[requirement] !== true) ||
  protocol.aggregationPolicy?.publishableOnlyWhenComplete !== true ||
  protocol.aggregationPolicy?.modelGrouping !== "single-global-model-version" ||
  protocol.aggregationPolicy?.failedAndTimedOutRuns !== "retained") {
  throw new Error("Agent-study protocol is incomplete or has drifted from its frozen contract.");
}

if (manifest.manifestVersion !== 1 || manifest.protocolVersion !== protocol.protocolVersion ||
  manifest.status !== "frozen" || typeof manifest.studyId !== "string" || !manifest.studyId.trim() ||
  !/^\d{4}-\d{2}-\d{2}$/.test(manifest.frozenAt) ||
  ["source", "rule", "rationale"].some((field) => typeof manifest.taskSelection?.[field] !== "string" || !manifest.taskSelection[field].trim()) ||
  !Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
  throw new Error("Agent-study task manifest is incomplete or is not frozen.");
}

const manifestTasks = new Map();
for (const [index, task] of manifest.tasks.entries()) {
  for (const field of ["taskId", "taskText", "taskTextSha256", "repository", "revision", "sourceIssue", "selectionRationale"]) {
    if (typeof task[field] !== "string" || !task[field].trim()) throw new Error(`Manifest task ${index + 1} is missing ${field}.`);
  }
  if (manifestTasks.has(task.taskId)) throw new Error(`Duplicate manifest taskId ${task.taskId}.`);
  if (!/^[a-z0-9][a-z0-9-]+$/.test(task.taskId)) throw new Error(`Manifest task ${index + 1} has an invalid taskId.`);
  if (!/^[a-f0-9]{64}$/.test(task.taskTextSha256) || sha256(task.taskText) !== task.taskTextSha256) {
    throw new Error(`Manifest task ${task.taskId} has a task-text hash mismatch.`);
  }
  for (const [field, url] of [["repository", task.repository], ["sourceIssue", task.sourceIssue]]) {
    try {
      if (new URL(url).protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`Manifest task ${task.taskId} has an invalid ${field} URL.`);
    }
  }
  if (!/^[a-f0-9]{40}$/i.test(task.revision)) throw new Error(`Manifest task ${task.taskId} has an invalid pinned revision.`);
  manifestTasks.set(task.taskId, task);
}

const inputPathOption = option("--input");
if (!inputPathOption) {
  process.stdout.write(`Agent-study protocol and ${manifest.tasks.length}-task frozen manifest valid. No run data supplied; no effectiveness result is claimed.\n`);
  process.exit(0);
}

const expectedModel = option("--model");
const expectedModelVersion = option("--model-version");
const expectedFixMapRevision = option("--fixmap-revision");
if (!expectedModel || !expectedModelVersion || !expectedFixMapRevision) {
  throw new Error("Run evaluation requires globally pinned --model, --model-version, and --fixmap-revision values.");
}
if (!/^[a-f0-9]{40}$/i.test(expectedFixMapRevision)) throw new Error("--fixmap-revision must be an exact 40-character Git revision.");

const inputPath = resolve(inputPathOption);
const inputDirectory = dirname(inputPath);
const rows = (await readFile(inputPath, "utf8"))
  .split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`); }
  });
if (rows.length === 0) throw new Error("Agent-study input contains no runs.");

const keys = new Set();
const transcripts = new Set();
const contexts = new Set();
for (const [index, row] of rows.entries()) {
  for (const field of [...identityFields, ...requiredMetrics]) {
    if (!(field in row)) throw new Error(`Run ${index + 1} is missing ${field}.`);
  }
  const manifestTask = manifestTasks.get(row.taskId);
  if (!manifestTask) throw new Error(`Run ${index + 1} has extra or unrecognized task ${JSON.stringify(row.taskId)}.`);
  if (row.studyId !== manifest.studyId) throw new Error(`Run ${index + 1} does not match frozen studyId ${manifest.studyId}.`);
  for (const field of ["environmentId", "contextId", "budgetId", "rubricId", "priceSheetId"]) {
    if (typeof row[field] !== "string" || !row[field].trim()) throw new Error(`Run ${index + 1} has invalid ${field}.`);
  }
  if (contexts.has(row.contextId)) throw new Error(`Run ${index + 1} reuses contextId ${JSON.stringify(row.contextId)}.`);
  contexts.add(row.contextId);
  if (!requiredArms.includes(row.arm)) throw new Error(`Run ${index + 1} has unknown arm ${JSON.stringify(row.arm)}.`);
  if (typeof row.taskText !== "string" || row.taskText !== manifestTask.taskText) throw new Error(`Run ${index + 1} task text differs from the frozen manifest.`);
  const computedTaskHash = sha256(row.taskText);
  if (!/^[a-f0-9]{64}$/i.test(row.taskTextSha256) || computedTaskHash !== row.taskTextSha256.toLowerCase()) {
    throw new Error(`Run ${index + 1} task-text hash does not match its task text.`);
  }
  if (row.taskTextSha256.toLowerCase() !== manifestTask.taskTextSha256.toLowerCase()) throw new Error(`Run ${index + 1} task-text hash does not match the frozen manifest.`);
  if (row.repository !== manifestTask.repository || row.revision !== manifestTask.revision) throw new Error(`Run ${index + 1} does not use the frozen repository revision for ${row.taskId}.`);
  if (row.model !== expectedModel || row.modelVersion !== expectedModelVersion) throw new Error(`Run ${index + 1} does not use the globally pinned model and version.`);
  if (row.fixmapRevision !== expectedFixMapRevision) throw new Error(`Run ${index + 1} does not use the globally pinned FixMap revision.`);
  if (row.tokenAccountingSource !== "provider-reported") throw new Error(`Run ${index + 1} token counters are not declared provider-reported.`);
  if (typeof row.transcript !== "string" || !row.transcript.trim()) throw new Error(`Run ${index + 1} has no transcript reference.`);
  if (isAbsolute(row.transcript)) throw new Error(`Run ${index + 1} transcript must be relative to the run file.`);
  const transcriptPath = resolve(inputDirectory, row.transcript);
  const transcriptRelative = relative(inputDirectory, transcriptPath);
  if (transcriptRelative === ".." || transcriptRelative.split(/[\\/]/)[0] === ".." || isAbsolute(transcriptRelative)) {
    throw new Error(`Run ${index + 1} transcript escapes the run-data directory.`);
  }
  if (transcripts.has(transcriptPath)) throw new Error(`Run ${index + 1} reuses transcript ${JSON.stringify(row.transcript)}.`);
  transcripts.add(transcriptPath);
  let transcriptBytes;
  try { transcriptBytes = await readFile(transcriptPath); } catch {
    throw new Error(`Run ${index + 1} transcript file is missing: ${row.transcript}.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(row.transcriptSha256) || sha256(transcriptBytes) !== row.transcriptSha256.toLowerCase()) {
    throw new Error(`Run ${index + 1} transcript SHA-256 does not match ${row.transcript}.`);
  }
  if (!runStatuses.includes(row.runStatus)) throw new Error(`Run ${index + 1} has invalid runStatus ${JSON.stringify(row.runStatus)}.`);
  if (!Number.isInteger(row.runOrder) || row.runOrder < 1 || row.runOrder > requiredArms.length) throw new Error(`Run ${index + 1} has an invalid runOrder.`);
  if (!Number.isFinite(row.timeoutMs) || row.timeoutMs <= 0) throw new Error(`Run ${index + 1} has an invalid timeoutMs.`);
  if (row.runStatus === "completed" && row.failureReason !== null) throw new Error(`Run ${index + 1} completed but has a failureReason.`);
  if (row.runStatus !== "completed" && (typeof row.failureReason !== "string" || !row.failureReason.trim())) throw new Error(`Run ${index + 1} failed without a failureReason.`);
  for (const metric of booleanMetrics) {
    if (row[metric] !== true && row[metric] !== false && row[metric] !== null) throw new Error(`Run ${index + 1} has invalid ${metric}; expected boolean or null.`);
  }
  for (const metric of numericMetrics) {
    if (row[metric] !== null && (!Number.isFinite(row[metric]) || row[metric] < 0)) throw new Error(`Run ${index + 1} has invalid ${metric}; expected a non-negative number or null.`);
  }
  if (row.totalTokens !== null && [row.inputTokens, row.outputTokens].every(Number.isFinite) && row.totalTokens < row.inputTokens + row.outputTokens) {
    throw new Error(`Run ${index + 1} reports totalTokens below inputTokens + outputTokens.`);
  }
  const key = `${row.taskId}\0${row.arm}`;
  if (keys.has(key)) throw new Error(`Duplicate task/arm run: ${row.taskId} / ${row.arm}.`);
  keys.add(key);
}

const expectedKeys = new Set(manifest.tasks.flatMap((task) => requiredArms.map((arm) => `${task.taskId}\0${arm}`)));
const missingKeys = [...expectedKeys].filter((key) => !keys.has(key));
if (missingKeys.length > 0) {
  const formatted = missingKeys.map((key) => key.replace("\0", " / ")).join(", ");
  throw new Error(`Study is missing required manifest task/arm runs: ${formatted}.`);
}
if (rows.length !== expectedKeys.size) throw new Error(`Study has ${rows.length} runs; expected exactly ${expectedKeys.size}.`);

for (const task of manifest.tasks) {
  const taskRows = rows.filter((row) => row.taskId === task.taskId);
  if (new Set(taskRows.map((row) => row.runOrder)).size !== requiredArms.length) throw new Error(`Task ${task.taskId} does not contain a unique randomized runOrder for every arm.`);
  for (const field of ["taskText", "taskTextSha256", "repository", "revision", "environmentId", "timeoutMs", "budgetId", "rubricId", "priceSheetId"]) {
    if (new Set(taskRows.map((row) => row[field])).size !== 1) throw new Error(`Task ${task.taskId} does not hold ${field} constant.`);
  }
}

const aggregate = Object.fromEntries(requiredArms.map((arm) => {
  const armRows = rows.filter((row) => row.arm === arm);
  const rate = (field) => armRows.filter((row) => row[field] === true).length / armRows.length;
  const median = (field) => {
    const values = armRows.map((row) => row[field]).filter(Number.isFinite).sort((a, b) => a - b);
    if (values.length === 0) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  return [arm, {
    runs: armRows.length,
    completedRuns: armRows.filter((row) => row.runStatus === "completed").length,
    failedRuns: armRows.filter((row) => row.runStatus === "failed").length,
    timedOutRuns: armRows.filter((row) => row.runStatus === "timed-out").length,
    taskResolutionRateAllRuns: rate("taskResolved"),
    acceptedPatchRateAllRuns: rate("finalPatchAccepted"),
    firstThreeFileRateAllRuns: rate("correctFileInFirstThreeOpened"),
    medianToolCallsToRelevantFile: median("toolCallsToFirstRelevantFile"),
    medianTotalToolCalls: median("totalToolCalls"),
    medianRepositorySearchCalls: median("repositorySearchCalls"),
    medianFilesRead: median("filesRead"),
    medianSourceBytesRead: median("sourceBytesRead"),
    medianInputTokens: median("inputTokens"),
    medianCachedInputTokens: median("cachedInputTokens"),
    medianOutputTokens: median("outputTokens"),
    medianReasoningTokens: median("reasoningTokens"),
    medianTotalTokens: median("totalTokens"),
    medianModelCostUsd: median("modelCostUsd"),
    medianTurns: median("turns"),
    medianWallClockMs: median("wallClockMs")
  }];
}));

process.stdout.write(`${JSON.stringify({
  protocolVersion: protocol.protocolVersion,
  manifestVersion: manifest.manifestVersion,
  studyId: manifest.studyId,
  taskManifestSha256: sha256(manifestBytes),
  model: expectedModel,
  modelVersion: expectedModelVersion,
  fixmapRevision: expectedFixMapRevision,
  tasks: manifest.tasks.length,
  arms: requiredArms.length,
  runs: rows.length,
  publishableAggregate: true,
  failuresRetained: true,
  aggregate
}, null, 2)}\n`);
