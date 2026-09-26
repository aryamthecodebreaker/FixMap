import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ContextPack, FixMapGraph } from "@aryam/fixmap-core";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";
import { createFixMapMcpServer } from "../src/mcp.js";

describe("graph and context interface regressions", () => {
  it.each(["CLI", "MCP"])("preserves primary imports and real EOF ranges through %s", async (surface) => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-graph-context-"));
    const server = createFixMapMcpServer();
    const client = new Client({ name: "fixmap-graph-regression", version: "0.0.0" });
    try {
      await mkdir(join(root, "src"));
      for (const [index, name] of ["a", "b", "c"].entries()) {
        const target = ["b", "c", "a"][index];
        await writeFile(join(root, "src", `${name}.js`), `import './${target}.js';\nexport const loginX = ${index};\n`);
      }
      if (surface === "MCP") {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      }
      async function invoke(command: "graph" | "context") {
        if (surface === "MCP") {
          const result = await client.callTool({ name: `fixmap_${command}`, arguments: { repo: root, issue: "loginX broken", format: "json" } });
          expect(result.isError).not.toBe(true);
          const content = result.content as Array<{ type: string; text?: string }>;
          return JSON.parse(content.filter((entry) => entry.type === "text").map((entry) => entry.text).join(""));
        }
        const output: string[] = [];
        const errors: string[] = [];
        const code = await runCli([command, "--repo", root, "--issue", "loginX broken", "--format", "json"], {
          stdout: (text) => output.push(text), stderr: (text) => errors.push(text)
        });
        expect(code, errors.join("")).toBe(0);
        return JSON.parse(output.join(""));
      }
      const graph = await invoke("graph") as FixMapGraph;
      expect(graph.nodes).toHaveLength(3);
      expect(graph.nodes.every((node) => node.role === "primary")).toBe(true);
      const paths = new Map(graph.nodes.map((node) => [node.id, node.path]));
      expect(graph.edges.map((edge) => `${paths.get(edge.from)} -> ${paths.get(edge.to)}`).sort()).toEqual([
        "src/a.js -> src/b.js", "src/b.js -> src/c.js", "src/c.js -> src/a.js"
      ]);
      const pack = await invoke("context") as ContextPack;
      expect(pack.snippets).toHaveLength(3);
      for (const snippet of pack.snippets) {
        expect(snippet).toMatchObject({ startLine: 1, endLine: 2 });
        expect(snippet.content.endsWith("\n")).toBe(true);
      }
    } finally {
      await client.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
