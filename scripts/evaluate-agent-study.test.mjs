import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evaluatorPath = join(root, "scripts", "evaluate-agent-study.mjs");
const manifest = JSON.parse(await readFile(join(root, "benchmarks", "agent-study", "tasks.json"), "utf8"));
const arms = ["baseline", "fixmap-available", "fixmap-instructed", "fixmap-impact"];
const model = "test-model";
const modelVersion = "test-model-2026-08-20";
const fixmapRevision = "bbc8469c937397fecac787c71c04521a6eb1a87d";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function createFixture(t, mutate = async () => {}) {
  const directory = await mkdtemp(join(tmpdir(), "fixmap-agent-study-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const transcriptDirectory = join(directory, "transcripts");
  await mkdir(transcriptDirectory);
  const rows = [];
  const transcriptPaths = [];

  for (const task of manifest.tasks) {
    for (const [armIndex, arm] of arms.entries()) {
      const transcriptPath = join(transcriptDirectory, `${task.taskId}-${arm}.txt`);
      const transcript = `Transcript for ${task.taskId} / ${arm}\n`;
      await writeFile(transcriptPath, transcript, "utf8");
      transcriptPaths.push(transcriptPath);
      rows.push({
        studyId: manifest.studyId,
        taskId: task.taskId,
        taskText: task.taskText,
        taskTextSha256: task.taskTextSha256,
        arm,
        runOrder: armIndex + 1,
        model,
        modelVersion,
        fixmapRevision,
        repository: task.repository,
        revision: task.revision,
        environmentId: "test-environment",
        contextId: `context-${task.taskId}-${arm}`,
        timeoutMs: 600000,
        budgetId: "test-budget",
        rubricId: `rubric-${task.taskId}`,
        priceSheetId: "test-price-sheet",
        tokenAccountingSource: "provider-reported",
        transcript: relative(directory, transcriptPath).replaceAll("\\", "/"),
        transcriptSha256: sha256(transcript),
        runStatus: "completed",
        failureReason: null,
        taskResolved: true,
        correctFileInFirstThreeOpened: true,
        toolCallsToFirstRelevantFile: 2,
        filesOpenedBeforeFirstEdit: 3,
        incorrectFilesEdited: 0,
        totalToolCalls: 8,
        inputTokens: 100,
        cachedInputTokens: null,
        outputTokens: 25,
        reasoningTokens: null,
        totalTokens: 125,
        modelCostUsd: 0.01,
        turns: 4,
        repositorySearchCalls: 2,
        filesRead: 3,
        sourceBytesRead: 4096,
        wallClockMs: 120000,
        testsSelectedCorrectly: true,
        finalPatchAccepted: true,
        fixmapPlanUsed: arm !== "baseline",
        verifyUsefulWarnings: arm === "fixmap-instructed" || arm === "fixmap-impact"
      });
    }
  }

  await mutate({ directory, rows, transcriptPaths });
  const runPath = join(directory, "runs.jsonl");
  await writeFile(runPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return { directory, rows, runPath, transcriptPaths };
}

async function evaluate(runPath, extraArguments = []) {
  return execFileAsync(process.execPath, [
    evaluatorPath,
    "--input", runPath,
    "--model", model,
    "--model-version", modelVersion,
    "--fixmap-revision", fixmapRevision,
    ...extraArguments
  ], { cwd: root });
}

test("accepts only the complete frozen manifest cross product", async (t) => {
  const fixture = await createFixture(t);
  const { stdout } = await evaluate(fixture.runPath);
  const result = JSON.parse(stdout);
  assert.equal(result.publishableAggregate, true);
  assert.equal(result.tasks, manifest.tasks.length);
  assert.equal(result.runs, manifest.tasks.length * arms.length);
  assert.equal(result.model, model);
  assert.equal(result.modelVersion, modelVersion);
  assert.equal(result.fixmapRevision, fixmapRevision);
});

test("rejects a missing manifest task", async (t) => {
  const taskId = manifest.tasks[0].taskId;
  const fixture = await createFixture(t, async ({ rows }) => {
    for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index].taskId === taskId) rows.splice(index, 1);
  });
  await assert.rejects(() => evaluate(fixture.runPath), /missing required manifest task\/arm runs/);
});

test("rejects a missing arm", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => {
    rows.splice(rows.findIndex((row) => row.arm === "fixmap-impact"), 1);
  });
  await assert.rejects(() => evaluate(fixture.runPath), /missing required manifest task\/arm runs/);
});

test("rejects an extra or unrecognized task", async (t) => {
  const fixture = await createFixture(t, async ({ directory, rows }) => {
    const extraTranscript = join(directory, "transcripts", "extra-task.txt");
    const content = "extra task transcript\n";
    await writeFile(extraTranscript, content, "utf8");
    rows.push({
      ...rows[0],
      taskId: "not-in-the-frozen-manifest",
      transcript: relative(directory, extraTranscript).replaceAll("\\", "/"),
      transcriptSha256: sha256(content)
    });
  });
  await assert.rejects(() => evaluate(fixture.runPath), /extra or unrecognized task/);
});

test("rejects altered task text", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => { rows[0].taskText += " altered"; });
  await assert.rejects(() => evaluate(fixture.runPath), /task text differs from the frozen manifest/);
});

test("rejects a mismatched task hash", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => { rows[0].taskTextSha256 = "0".repeat(64); });
  await assert.rejects(() => evaluate(fixture.runPath), /task-text hash does not match/);
});

test("rejects a missing transcript file", async (t) => {
  const fixture = await createFixture(t, async ({ transcriptPaths }) => { await unlink(transcriptPaths[0]); });
  await assert.rejects(() => evaluate(fixture.runPath), /transcript file is missing/);
});

test("rejects a transcript modified after hashing", async (t) => {
  const fixture = await createFixture(t, async ({ transcriptPaths }) => { await writeFile(transcriptPaths[0], "modified transcript\n", "utf8"); });
  await assert.rejects(() => evaluate(fixture.runPath), /transcript SHA-256 does not match/);
});

test("rejects an incorrect transcript hash", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => { rows[0].transcriptSha256 = "0".repeat(64); });
  await assert.rejects(() => evaluate(fixture.runPath), /transcript SHA-256 does not match/);
});

test("rejects mixed model versions instead of pooling them", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => { rows[0].modelVersion = "different-version"; });
  await assert.rejects(() => evaluate(fixture.runPath), /globally pinned model and version/);
});

test("rejects duplicate task-arm runs", async (t) => {
  const fixture = await createFixture(t, async ({ directory, rows }) => {
    const duplicateTranscript = join(directory, "transcripts", "duplicate-run.txt");
    const content = "duplicate run transcript\n";
    await writeFile(duplicateTranscript, content, "utf8");
    rows.push({
      ...rows[0],
      contextId: "context-duplicate-run",
      transcript: relative(directory, duplicateTranscript).replaceAll("\\", "/"),
      transcriptSha256: sha256(content)
    });
  });
  await assert.rejects(() => evaluate(fixture.runPath), /Duplicate task\/arm run/);
});

test("rejects a reused context instead of treating it as a fresh run", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => { rows[1].contextId = rows[0].contextId; });
  await assert.rejects(() => evaluate(fixture.runPath), /reuses contextId/);
});

test("retains failed and timed-out runs in the publishable aggregate", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => {
    rows[0].runStatus = "failed";
    rows[0].failureReason = "agent process exited";
    rows[0].taskResolved = null;
    rows[0].finalPatchAccepted = null;
    rows[1].runStatus = "timed-out";
    rows[1].failureReason = "study timeout reached";
    rows[1].taskResolved = null;
    rows[1].finalPatchAccepted = null;
  });
  const { stdout } = await evaluate(fixture.runPath);
  const result = JSON.parse(stdout);
  assert.equal(result.runs, manifest.tasks.length * arms.length);
  assert.equal(result.aggregate.baseline.failedRuns, 1);
  assert.equal(result.aggregate["fixmap-available"].timedOutRuns, 1);
  assert.equal(result.aggregate.baseline.runs, manifest.tasks.length);
  assert.equal(result.aggregate["fixmap-available"].runs, manifest.tasks.length);
  assert.equal(result.aggregate.baseline.taskResolutionRateAllRuns, (manifest.tasks.length - 1) / manifest.tasks.length);
  assert.equal(result.aggregate["fixmap-available"].taskResolutionRateAllRuns, (manifest.tasks.length - 1) / manifest.tasks.length);
});

test("rejects a discarded failed run as an incomplete task-arm cross product", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => {
    rows[0].runStatus = "failed";
    rows[0].failureReason = "agent process exited";
    rows.splice(0, 1);
  });
  await assert.rejects(() => evaluate(fixture.runPath), /missing required manifest task\/arm runs/);
});

test("keeps unsupported provider token counters null without estimating them", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => {
    for (const row of rows.filter((candidate) => candidate.arm === "baseline")) {
      row.inputTokens = null;
      row.cachedInputTokens = null;
      row.outputTokens = null;
      row.reasoningTokens = null;
      row.totalTokens = null;
    }
  });
  const { stdout } = await evaluate(fixture.runPath);
  const result = JSON.parse(stdout);
  assert.equal(result.aggregate.baseline.medianInputTokens, null);
  assert.equal(result.aggregate.baseline.medianTotalTokens, null);
});

test("requires an explicit global model and model version", async (t) => {
  const fixture = await createFixture(t);
  await assert.rejects(
    () => execFileAsync(process.execPath, [evaluatorPath, "--input", fixture.runPath], { cwd: root }),
    /globally pinned --model, --model-version, and --fixmap-revision/
  );
});

test("rejects a mixed FixMap revision", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => { rows[0].fixmapRevision = "0".repeat(40); });
  await assert.rejects(() => evaluate(fixture.runPath), /globally pinned FixMap revision/);
});

test("rejects token counters that are not declared provider-reported", async (t) => {
  const fixture = await createFixture(t, async ({ rows }) => { rows[0].tokenAccountingSource = "estimated"; });
  await assert.rejects(() => evaluate(fixture.runPath), /token counters are not declared provider-reported/);
});
