export type TestOutcomeStatus = "passed" | "failed" | "timeout" | "crashed" | "unavailable";

export type OutcomeRecord = {
  outcomeRecordVersion: 1;
  id: string;
  taskId: string;
  repositoryIdentity: string;
  planFingerprint: string;
  recordedAt: string;
  predictedPaths: string[];
  editedPaths: string[];
  testOutcomes: Array<{
    command: string;
    status: TestOutcomeStatus;
    relatedPaths: string[];
    evidence: string;
  }>;
  taskAssessment: {
    status: "succeeded" | "failed" | "partial" | "unknown";
    source: "human" | "agent" | "external-system" | "unassessed";
    reason: string;
  };
};

export type OutcomeStore = { outcomeStoreVersion: 1; records: OutcomeRecord[] };

export type OutcomeCalibration = {
  outcomeCalibrationVersion: 1;
  records: number;
  totals: {
    predictedPaths: number;
    editedPaths: number;
    correctlyPredictedEdits: number;
    predictedButUnedited: number;
    editedButUnpredicted: number;
  };
  precision: number | null;
  recall: number | null;
  testOutcomes: Record<TestOutcomeStatus, number>;
  taskAssessments: Record<OutcomeRecord["taskAssessment"]["status"], number>;
  perRecord: Array<{
    id: string;
    correctlyPredicted: string[];
    predictedButUnedited: string[];
    editedButUnpredicted: string[];
    precision: number | null;
    recall: number | null;
  }>;
  automaticWeightChanges: false;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,255}$/;
const MAX_RECORDS = 50_000;
const MAX_PATHS = 5_000;
const MAX_TESTS = 1_000;

export function emptyOutcomeStore(): OutcomeStore { return { outcomeStoreVersion: 1, records: [] }; }

export function createOutcomeRecord(input: Omit<OutcomeRecord, "outcomeRecordVersion">): OutcomeRecord {
  return validateOutcomeRecord({ outcomeRecordVersion: 1, ...input });
}

export function validateOutcomeStore(candidate: unknown): OutcomeStore {
  if (!isRecord(candidate) || candidate.outcomeStoreVersion !== 1 ||
    !Array.isArray(candidate.records) || candidate.records.length > MAX_RECORDS) {
    throw new Error("Invalid outcome store envelope.");
  }
  const records = candidate.records.map(validateOutcomeRecord).sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)
  );
  const duplicate = records.find((record, index) => records.findIndex((value) => value.id === record.id) !== index);
  if (duplicate) throw new Error(`Duplicate outcome record id: ${duplicate.id}`);
  return { outcomeStoreVersion: 1, records };
}

export function addOutcomeRecord(store: OutcomeStore, record: OutcomeRecord): OutcomeStore {
  const current = validateOutcomeStore(store);
  const next = validateOutcomeRecord(record);
  if (current.records.some((value) => value.id === next.id)) throw new Error(`Outcome record already exists: ${next.id}`);
  return validateOutcomeStore({ outcomeStoreVersion: 1, records: [...current.records, next] });
}

export function removeOutcomeRecord(store: OutcomeStore, id: string): OutcomeStore {
  if (!ID.test(id)) throw new Error("Invalid outcome record id.");
  const current = validateOutcomeStore(store);
  if (!current.records.some((record) => record.id === id)) throw new Error(`Outcome record not found: ${id}`);
  return { outcomeStoreVersion: 1, records: current.records.filter((record) => record.id !== id) };
}

/** Visible calibration only. This function has no access to, and never changes, ranking weights. */
export function summarizeOutcomeCalibration(store: OutcomeStore): OutcomeCalibration {
  const records = validateOutcomeStore(store).records;
  const perRecord = records.map((record) => {
    const predicted = new Set(record.predictedPaths);
    const edited = new Set(record.editedPaths);
    const correctlyPredicted = record.predictedPaths.filter((path) => edited.has(path));
    const predictedButUnedited = record.predictedPaths.filter((path) => !edited.has(path));
    const editedButUnpredicted = record.editedPaths.filter((path) => !predicted.has(path));
    return {
      id: record.id,
      correctlyPredicted,
      predictedButUnedited,
      editedButUnpredicted,
      precision: ratio(correctlyPredicted.length, record.predictedPaths.length),
      recall: ratio(correctlyPredicted.length, record.editedPaths.length)
    };
  });
  const totals = {
    predictedPaths: records.reduce((sum, record) => sum + record.predictedPaths.length, 0),
    editedPaths: records.reduce((sum, record) => sum + record.editedPaths.length, 0),
    correctlyPredictedEdits: perRecord.reduce((sum, record) => sum + record.correctlyPredicted.length, 0),
    predictedButUnedited: perRecord.reduce((sum, record) => sum + record.predictedButUnedited.length, 0),
    editedButUnpredicted: perRecord.reduce((sum, record) => sum + record.editedButUnpredicted.length, 0)
  };
  const testOutcomes = countValues<TestOutcomeStatus>(["passed", "failed", "timeout", "crashed", "unavailable"]);
  const taskAssessments = countValues<OutcomeRecord["taskAssessment"]["status"]>(["succeeded", "failed", "partial", "unknown"]);
  for (const record of records) {
    for (const outcome of record.testOutcomes) testOutcomes[outcome.status] += 1;
    taskAssessments[record.taskAssessment.status] += 1;
  }
  return {
    outcomeCalibrationVersion: 1,
    records: records.length,
    totals,
    precision: ratio(totals.correctlyPredictedEdits, totals.predictedPaths),
    recall: ratio(totals.correctlyPredictedEdits, totals.editedPaths),
    testOutcomes,
    taskAssessments,
    perRecord,
    automaticWeightChanges: false
  };
}

function validateOutcomeRecord(candidate: unknown): OutcomeRecord {
  if (!isRecord(candidate) || candidate.outcomeRecordVersion !== 1 || typeof candidate.id !== "string" || !ID.test(candidate.id) ||
    typeof candidate.taskId !== "string" || !ID.test(candidate.taskId) ||
    typeof candidate.repositoryIdentity !== "string" || !candidate.repositoryIdentity.startsWith("fixmap://") || candidate.repositoryIdentity.length > 2_048 ||
    typeof candidate.planFingerprint !== "string" || !FINGERPRINT.test(candidate.planFingerprint) ||
    typeof candidate.recordedAt !== "string" || !Number.isFinite(Date.parse(candidate.recordedAt)) ||
    !Array.isArray(candidate.predictedPaths) || candidate.predictedPaths.length > MAX_PATHS ||
    !Array.isArray(candidate.editedPaths) || candidate.editedPaths.length > MAX_PATHS ||
    !Array.isArray(candidate.testOutcomes) || candidate.testOutcomes.length > MAX_TESTS || !isRecord(candidate.taskAssessment)) {
    throw new Error("Invalid outcome record envelope.");
  }
  const predictedPaths = paths(candidate.predictedPaths, "predicted");
  const editedPaths = paths(candidate.editedPaths, "edited");
  const testOutcomes = candidate.testOutcomes.map((value, index) => {
    if (!isRecord(value) || !bounded(value.command, 1_000) ||
      !["passed", "failed", "timeout", "crashed", "unavailable"].includes(String(value.status)) ||
      !Array.isArray(value.relatedPaths) || !bounded(value.evidence, 2_000)) {
      throw new Error(`Invalid test outcome at index ${index}.`);
    }
    return {
      command: value.command.trim(),
      status: value.status as TestOutcomeStatus,
      relatedPaths: paths(value.relatedPaths, "test-related"),
      evidence: value.evidence.trim()
    };
  }).sort((a, b) => a.command.localeCompare(b.command));
  const assessment = candidate.taskAssessment;
  if (!["succeeded", "failed", "partial", "unknown"].includes(String(assessment.status)) ||
    !["human", "agent", "external-system", "unassessed"].includes(String(assessment.source)) || !bounded(assessment.reason, 2_000) ||
    (assessment.source === "unassessed" && assessment.status !== "unknown")) {
    throw new Error("Invalid task outcome assessment.");
  }
  return {
    outcomeRecordVersion: 1,
    id: candidate.id,
    taskId: candidate.taskId,
    repositoryIdentity: candidate.repositoryIdentity,
    planFingerprint: candidate.planFingerprint,
    recordedAt: new Date(candidate.recordedAt).toISOString(),
    predictedPaths,
    editedPaths,
    testOutcomes,
    taskAssessment: {
      status: assessment.status as OutcomeRecord["taskAssessment"]["status"],
      source: assessment.source as OutcomeRecord["taskAssessment"]["source"],
      reason: assessment.reason.trim()
    }
  };
}

function paths(values: unknown[], label: string): string[] {
  if (values.length > MAX_PATHS || !values.every((value) => typeof value === "string" && safePath(value))) {
    throw new Error(`Invalid ${label} outcome paths.`);
  }
  return [...new Set((values as string[]).map((value) => value.replace(/\\/g, "/")))].sort();
}
function safePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return Boolean(normalized) && normalized.length <= 1_000 && !normalized.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    normalized.split("/").every((part) => part && part !== "." && part !== "..");
}
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function ratio(numerator: number, denominator: number): number | null { return denominator === 0 ? null : Number((numerator / denominator).toFixed(6)); }
function countValues<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
