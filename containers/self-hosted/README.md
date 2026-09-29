# FixMap self-hosted container candidates

The multi-stage Dockerfile has two explicit targets:

- `mcp` runs the real local stdio MCP server against `/workspace`, with a persistent cache at `/var/lib/fixmap/cache`.
- `web` runs the product/documentation UI on port 3000. The current UI is not a remote scanner service.

Both targets use an official Node 24 Bookworm slim manifest pinned by digest, run as the image's non-root `node` user, set a writable temporary home, and include target-appropriate health checks. Neither application requires outbound network at runtime. Enforce zero egress with the runtime or orchestrator (for example Docker `--network none` for stdio MCP); an image cannot impose its own network policy.

Example build commands:

```sh
docker build -f containers/self-hosted/Dockerfile --target mcp -t fixmap-mcp:candidate .
docker build -f containers/self-hosted/Dockerfile --target web -t fixmap-web:candidate .
```

No image is published by this repository change. Before release, a Docker-capable clean environment must build both targets, inspect the effective user and base digest, run the MCP protocol smoke with `--network none` and read-only source, run the web health check with zero egress, verify cache persistence/isolation, scan the images, and record multi-architecture evidence. Helm remains intentionally blocked until FixMap has a persistent authenticated service rather than local stdio MCP plus a product UI.
