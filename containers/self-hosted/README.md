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

No image is published. The Container workflow runs `scripts/container-smoke.mjs` on native amd64 and arm64 runners: it builds both targets, checks the non-root user and uid, the Debian bookworm base and Node 24, runs the real MCP server with `--network none`, a read-only root filesystem, dropped capabilities and a read-only git workspace (initialize, list tools, plan, verify a diff, read history), checks that the cache persists in its volume while another volume stays empty, and checks web health and pages with no network. The MCP image includes git, with `/workspace` marked safe because the mount belongs to the host user. Image vulnerability scanning and SBOM publication remain. Helm remains intentionally blocked until FixMap has a persistent authenticated service rather than local stdio MCP plus a product UI.
