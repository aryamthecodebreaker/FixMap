import { expect, it } from "vitest";
import { createEditorProtocolSnapshot } from "../src/editor-protocol.js";
import { serveEditorProtocol, runEditorStreams, EDITOR_REQUEST_MAX_BYTES, EDITOR_RESPONSE_MAX_BYTES } from "../src/editor-transport.js";
import { PassThrough, Readable, Writable } from "node:stream";

const snapshot = () => createEditorProtocolSnapshot({ reportVersion: 1, summary: "Local", contextFiles: [], changedFiles: [], testRoutes: [], risks: [], diagnostics: [] });
const request = Buffer.from(JSON.stringify({ editorProtocolVersion: 1, id: "one", method: "fixmap/plan" }));
async function* chunks(values: Uint8Array[]) { yield* values; }
async function collect(values: Uint8Array[]) {
  const output: unknown[] = [];
  for await (const line of serveEditorProtocol(snapshot(), chunks(values))) output.push(JSON.parse(line));
  return output;
}

it("frames fragmented requests, CRLF, blank lines, and a final unterminated frame", async () => {
  const output = await collect([request.subarray(0, 5), request.subarray(5), Buffer.from("\r\n\n"), request]);
  expect(output).toHaveLength(2);
  expect(output).toEqual([expect.objectContaining({ id: "one", result: { summary: "Local", contextFiles: [], changedFiles: [], impact: null, testRoutes: [], risks: [], diagnostics: [], analysis: null, retrieval: null, policy: null } }), expect.objectContaining({ id: "one" })]);
});

it("rejects malformed UTF-8, JSON, and oversized frames, then resumes at the next newline", async () => {
  const output = await collect([Buffer.from([0xff, 10]), Buffer.from("{secret\n"), Buffer.alloc(EDITOR_REQUEST_MAX_BYTES + 1, 32), Buffer.from("\n"), request]);
  expect(output).toHaveLength(4);
  expect(JSON.stringify(output)).not.toContain("secret");
  expect(output.slice(0, 3)).toEqual(Array.from({ length: 3 }, () => expect.objectContaining({ error: expect.objectContaining({ code: "invalid-request" }) })));
  expect(output[3]).toMatchObject({ id: "one", result: { summary: "Local" } });
});

it("does not pull another input chunk until the consumer requests another response", async () => {
  let pulls = 0;
  let closed = false;
  async function* input() {
    try { pulls++; yield Buffer.concat([request, Buffer.from("\n")]); pulls++; yield request; }
    finally { closed = true; }
  }
  const stream = serveEditorProtocol(snapshot(), input());
  await stream.next();
  expect(pulls).toBe(1);
  await stream.return(undefined);
  expect(pulls).toBe(1);
  expect(closed).toBe(true);
});

it("accepts exactly the request byte limit and preserves split multibyte UTF-8", async () => {
  const exact = Buffer.concat([request, Buffer.alloc(EDITOR_REQUEST_MAX_BYTES - request.length, 32)]);
  expect((await collect([exact]))[0]).toMatchObject({ id: "one", result: { summary: "Local" } });
  const unicode = Buffer.from(JSON.stringify({ editorProtocolVersion: 1, id: "one", method: "fixmap/file", params: { path: "src/日本.ts" } }));
  const split = unicode.indexOf(Buffer.from("日")) + 1;
  expect((await collect([unicode.subarray(0, split), unicode.subarray(split)]))[0]).toMatchObject({ result: { path: "src/日本.ts" } });
});

it("replaces oversized responses with a correlated error and serves the next request", async () => {
  const large = createEditorProtocolSnapshot({ reportVersion: 1, summary: "界".repeat(Math.ceil(EDITOR_RESPONSE_MAX_BYTES / 3)), contextFiles: [], changedFiles: [], testRoutes: [], risks: [], diagnostics: [] });
  const next = Buffer.from(JSON.stringify({ editorProtocolVersion: 1, id: "two", method: "fixmap/capabilities" }));
  const output: string[] = [];
  for await (const line of serveEditorProtocol(large, chunks([Buffer.concat([request, Buffer.from("\n"), next])]))) output.push(line);
  expect(JSON.parse(output[0]!)).toMatchObject({ id: "one", error: { message: "Editor response exceeds 4 MiB; request a narrower view." } });
  expect(Buffer.byteLength(output[0]!)).toBeLessThan(1000);
  expect(JSON.parse(output[1]!)).toMatchObject({ id: "two", result: { privacy: { networkRequired: false } } });
}, 20_000);

it("runs a real stream session and closes output at EOF", async () => {
  const lines: string[] = [];
  const output = new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } });
  await runEditorStreams(snapshot(), Readable.from([request]), output);
  expect(output.writableFinished).toBe(true);
  expect(JSON.parse(lines.join(""))).toMatchObject({ id: "one" });
});

it("rejects predecoded input without consuming it", async () => {
  const input = new PassThrough();
  input.setEncoding("utf8");
  const output = new PassThrough();
  await expect(runEditorStreams(snapshot(), input, output)).rejects.toThrow("byte stream");
  input.destroy(); output.destroy();
});

it("aborts a session waiting for input and destroys its streams", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const controller = new AbortController();
  const session = runEditorStreams(snapshot(), input, output, controller.signal);
  const rejected = expect(session).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  expect(input.destroyed).toBe(true);
  expect(output.destroyed).toBe(true);
});

it("terminates when output closes without an error while input is idle", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = runEditorStreams(snapshot(), input, output);
  const rejected = expect(session).rejects.toMatchObject({ code: "ERR_STREAM_PREMATURE_CLOSE" });
  output.destroy();
  try { await rejected; }
  finally { input.destroy(); output.destroy(); }
  expect(input.destroyed).toBe(true);
}, 2_000);

it("captures the host snapshot once per frame, including frames in the same input chunk", async () => {
  const before = snapshot();
  const after = createEditorProtocolSnapshot({ ...before.report, summary: "Refreshed" });
  let current = before;
  let reads = 0;
  const stream = serveEditorProtocol(() => { reads++; return current; }, chunks([Buffer.concat([request, Buffer.from("\n"), request])]));
  const first = JSON.parse((await stream.next()).value!);
  current = after;
  const second = JSON.parse((await stream.next()).value!);
  expect(first).toMatchObject({ snapshotFingerprint: before.snapshotFingerprint, result: { summary: "Local" } });
  expect(second).toMatchObject({ snapshotFingerprint: after.snapshotFingerprint, result: { summary: "Refreshed" } });
  expect(reads).toBe(2);
  expect((await stream.next()).done).toBe(true);
});
