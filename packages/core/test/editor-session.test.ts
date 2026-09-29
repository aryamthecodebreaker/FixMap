import { expect, it } from "vitest";
import { createEditorSession, type EditorSnapshotInput } from "../src/editor-session.js";

const input = (summary: string): EditorSnapshotInput => ({ report: { reportVersion: 1, summary, contextFiles: [], changedFiles: [], testRoutes: [], risks: [], diagnostics: [] } });
function deferred() {
  let resolve!: (value: EditorSnapshotInput) => void;
  const promise = new Promise<EditorSnapshotInput>((done) => { resolve = done; });
  return { promise, resolve };
}

it("publishes only the newest requested refresh even when scans finish out of order", async () => {
  const session = createEditorSession(input("initial"));
  const slow = deferred();
  const older = session.refresh(() => slow.promise);
  const newer = await session.refresh(async () => input("newer"));
  slow.resolve(input("older"));
  expect(await older).toEqual({ applied: false, snapshotFingerprint: newer.snapshotFingerprint });
  expect(session.snapshot().report.summary).toBe("newer");
});

it("retains the last valid snapshot after loader or validation failure", async () => {
  const session = createEditorSession(input("initial"));
  const before = session.snapshot();
  await expect(session.refresh(async () => { throw new Error("scan failed"); })).rejects.toThrow("scan failed");
  await expect(session.refresh(async () => ({ report: {} }))).rejects.toThrow();
  expect(session.snapshot()).toBe(before);
});

it("does not publish pending work after close and refuses new requests", async () => {
  const session = createEditorSession(input("initial"));
  const pending = deferred();
  const refresh = session.refresh(() => pending.promise);
  session.close();
  pending.resolve(input("late"));
  expect((await refresh).applied).toBe(false);
  expect(() => session.snapshot()).toThrow("closed");
  await expect(session.refresh(async () => input("no"))).rejects.toThrow("closed");
});
