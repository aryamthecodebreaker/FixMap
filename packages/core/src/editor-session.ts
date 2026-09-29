import { createEditorProtocolSnapshot, type EditorProtocolSnapshot } from "./editor-protocol.js";
import type { RepoMap } from "./types.js";

export type EditorSnapshotInput = { report: unknown; repository?: RepoMap };

/** Host-owned refresh ordering. Loaders must return evidence from one coherent scan. */
export function createEditorSession(initial: EditorSnapshotInput) {
  let current = createEditorProtocolSnapshot(initial.report, initial.repository);
  let generation = 0;
  let closed = false;
  return {
    snapshot(): EditorProtocolSnapshot {
      if (closed) throw new Error("Editor session is closed.");
      return current;
    },
    async refresh(load: () => Promise<EditorSnapshotInput>): Promise<{ applied: boolean; snapshotFingerprint: string }> {
      if (closed) throw new Error("Editor session is closed.");
      const requested = ++generation;
      const input = await load();
      if (closed || requested !== generation) return { applied: false, snapshotFingerprint: current.snapshotFingerprint };
      const replacement = createEditorProtocolSnapshot(input.report, input.repository);
      current = replacement;
      return { applied: true, snapshotFingerprint: current.snapshotFingerprint };
    },
    close(): void { closed = true; generation++; }
  };
}
