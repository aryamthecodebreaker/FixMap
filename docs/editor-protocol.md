# FixMap editor protocol v1

The editor protocol is a read-only, local-process contract shared by VS Code, JetBrains, Neovim, and other editor adapters. It projects one validated FixMap `reportVersion: 1` snapshot; it does not upload source, require a network connection, or mutate repository state.

Create a snapshot with `createEditorProtocolSnapshot(report)`, then pass parsed JSON requests to `handleEditorProtocolRequest(snapshot, request)`. The snapshot is deep-frozen and content-fingerprinted. Every response repeats that fingerprint so an adapter can discard stale views after generating a newer report.

## Request envelope

```json
{
  "editorProtocolVersion": 1,
  "id": "editor-request-1",
  "method": "fixmap/file",
  "params": { "path": "src/auth.ts" }
}
```

Request IDs use letters, digits, `.`, `_`, `:`, `/`, or `-`. Paths must be safe repository-relative paths. An adapter should use one local process transport and frame JSON messages itself; v1 deliberately does not prescribe newline or `Content-Length` framing.

## Methods

- `fixmap/capabilities` returns supported methods, source report version, and the no-network/no-upload/read-only privacy contract.
- `fixmap/plan` returns the report summary, ranked context, impact, routed tests, risks, diagnostics, analysis, retrieval provenance, and policy result from the same snapshot.
- `fixmap/file` requires `params.path` and joins that path’s ranked context, impact, routed tests, annotation assessments (including stale/expired status), authored decisions, policy findings, and clearly labeled repository-wide risks.
- `fixmap/annotations` accepts an optional `params.path` and returns annotation source provenance plus assessments. It returns `mutationSupported: false`; adapters must use a separately reviewed repository annotation workflow for writes.
- `loadEditorSnapshot({ repoRoot, issueText, useCache?, includeHistory?, exclude? })` performs local lexical analysis and returns the report plus repository from the same scan. It applies that analysis's resolved exclusions to editor graph files and rejects error diagnostics. It accepts no model/provider configuration. Use it as the session refresh loader; hosts still choose when to refresh and own watcher/process lifecycle.
- `createEditorSession({ report, repository? })` coordinates host refreshes. Pass `session.snapshot` to the transport and call `session.refresh(loader)` after a host-triggered scan; the loader must return a report and repository from one coherent scan. Only the latest requested refresh may publish. Failures preserve the last valid snapshot, while `close()` prevents late publication and future reads/refreshes. Closing does not cancel an already-running loader: the host must separately abort its scan and stream session. No filesystem watcher is created by this coordinator.
- Both transport helpers accept a snapshot or a synchronous `() => snapshot` getter. A host can build a new immutable snapshot off the request path and then replace its current reference. The getter is read exactly once per completed nonempty request frame, including multiple frames in a single input chunk. Each response carries that captured snapshot's fingerprint. The transport does not initiate rescans or accept replacement snapshots from request data; failed host refreshes should leave the last valid snapshot selected.
- `runEditorStreams(snapshot, readable, writable, signal?)` connects byte-oriented Node streams with pipeline backpressure. It owns the session streams: EOF finishes output, and abort closes input/output even while waiting for a request. Input with a text encoding is rejected before consumption so malformed UTF-8 cannot be concealed. Process spawning and choosing or refreshing a snapshot remain host responsibilities.
- Node hosts can use `serveEditorProtocol(snapshot, input)` with an async byte stream. It yields one JSON response per newline-delimited request, accepts CRLF and an unterminated final frame, bounds incoming frames to 64 KiB and serialized responses to 4 MiB, and rejects malformed UTF-8/JSON without echoing input. Oversized frames are discarded through the next newline before processing resumes. Iteration supplies backpressure; hosts must await their output stream's drain signal before requesting another response. The host owns process startup, stream cancellation, and snapshot refresh; this helper opens no sockets or files.
- `fixmap/change-scope` is advertised only when the host supplies its local scanner's `RepoMap` as the second argument to `createEditorProtocolSnapshot(report, repo)`. The repository is cloned, frozen, and included in the snapshot identity; it is not accepted from protocol request data. Params are `workspace`, `repository`, explicit `anchors`, `asOf`, and optional `direction`, `maxDepth`, and `maxNodes`, using the same Core change-scope engine and bounds as the CLI. Report-only snapshots return `method-not-found`: a ranked plan cannot substitute for the repository graph. No filesystem reads, execution, or network calls occur in this request handler. Concrete editor host wiring remains separate work.

## Response and errors

```json
{
  "editorProtocolVersion": 1,
  "id": "editor-request-1",
  "snapshotFingerprint": "editor-snapshot:0123456789abcdef",
  "result": {}
}
```

Errors replace `result` with `{ "error": { "code": "...", "message": "..." } }`. Stable v1 error codes are `invalid-request`, `unsupported-version`, `method-not-found`, and `invalid-params`. Unknown additive result fields must be ignored. A breaking envelope or semantic change requires a new `editorProtocolVersion`.

The protocol is not an editor extension by itself. Each adapter still needs lifecycle management, cancellation/debouncing, UI rendering, accessibility, packaging, and integration tests while preserving this contract.
