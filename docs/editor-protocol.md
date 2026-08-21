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
