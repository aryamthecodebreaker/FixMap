import { expect, it } from "vitest";
import { createEditorProtocolSnapshot } from "../src/editor-protocol.js";
import { serveEditorProtocol, EDITOR_REQUEST_MAX_BYTES } from "../src/editor-transport.js";

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
  async function* input() { pulls++; yield Buffer.concat([request, Buffer.from("\n")]); pulls++; yield request; }
  const stream = serveEditorProtocol(snapshot(), input());
  await stream.next();
  expect(pulls).toBe(1);
  await stream.return(undefined);
  expect(pulls).toBe(1);
});
