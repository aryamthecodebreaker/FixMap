import { handleEditorProtocolRequest, type EditorProtocolSnapshot, type EditorProtocolResponse } from "./editor-protocol.js";
import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const EDITOR_REQUEST_MAX_BYTES = 65_536;
export const EDITOR_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;

/** Owns these session streams: completion ends output; failure/abort destroys both. */
export async function runEditorStreams(
  snapshot: EditorProtocolSnapshot,
  input: Readable,
  output: Writable,
  signal?: AbortSignal
): Promise<void> {
  // Keep stdin byte-oriented: string decoding would conceal malformed UTF-8.
  if (input.readableEncoding !== null) throw new Error("Editor input must be a byte stream without a text encoding.");
  signal?.throwIfAborted();
  const stopInput = () => { input.destroy(); };
  signal?.addEventListener("abort", stopInput, { once: true });
  output.once("error", stopInput);
  output.once("close", stopInput);
  try {
    await pipeline(Readable.from(serveEditorProtocol(snapshot, input)), output, { signal });
  } finally {
    signal?.removeEventListener("abort", stopInput);
    output.removeListener("error", stopInput);
    output.removeListener("close", stopInput);
    input.destroy();
  }
}

/** Local NDJSON framing. The host owns streams/lifecycle; yielding supplies backpressure. */
export async function* serveEditorProtocol(
  snapshot: EditorProtocolSnapshot,
  input: AsyncIterable<Uint8Array>
): AsyncGenerator<string> {
  const frame = new Uint8Array(EDITOR_REQUEST_MAX_BYTES);
  let length = 0;
  let oversized = false;
  const failure = (message: string): EditorProtocolResponse => ({
    editorProtocolVersion: 1, id: null, snapshotFingerprint: snapshot.snapshotFingerprint,
    error: { code: "invalid-request", message }
  });
  const render = (): string => {
    let result: EditorProtocolResponse;
    if (oversized) result = failure("Editor request exceeds 64 KiB.");
    else {
      let request: unknown;
      try {
        request = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(frame.subarray(0, length)));
      } catch {
        return `${JSON.stringify(failure("Editor request must be valid UTF-8 JSON."))}\n`;
      }
      result = handleEditorProtocolRequest(snapshot, request);
    }
    const output = JSON.stringify(result);
    if (Buffer.byteLength(output, "utf8") > EDITOR_RESPONSE_MAX_BYTES) {
      return `${JSON.stringify({ ...failure("Editor response exceeds 4 MiB; request a narrower view."), id: result.id })}\n`;
    }
    return `${output}\n`;
  };
  for await (const chunk of input) {
    for (const byte of chunk) {
      if (byte === 10) {
        if (length > 0 || oversized) yield render();
        length = 0;
        oversized = false;
      } else if (!oversized) {
        if (length === frame.length) oversized = true;
        else frame[length++] = byte;
      }
    }
  }
  if (length > 0 || oversized) yield render();
}
