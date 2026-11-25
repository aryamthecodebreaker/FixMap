"use client";

import { useState } from "react";
import { CopyCommand } from "./copy-command";

const ways = [
  {
    id: "agent",
    label: "In your AI tool",
    intro: "Adds a /fixmap command to Claude Code, Cursor, GitHub Copilot and other tools that read agent skills. Run these two once, then type /fixmap before you ask for a fix.",
    commands: ["npm install --global @aryam/fixmap@latest", "fixmap setup"]
  },
  {
    id: "terminal",
    label: "In the terminal",
    intro: "Run it on any task in the project you are in. No account, no API key, nothing uploaded.",
    commands: ['npx -y @aryam/fixmap@latest plan --issue "password reset emails never arrive"']
  },
  {
    id: "mcp",
    label: "As tools over MCP",
    intro: "Lets an agent call FixMap itself: plan, explain why a file was picked, gather context, or check a finished change.",
    commands: ["claude mcp add fixmap -- fixmap mcp"]
  }
] as const;

export function Install({ workflow }: { workflow: string }) {
  const [active, setActive] = useState<string>(ways[0].id);
  const tabs = [...ways.map((way) => ({ id: way.id, label: way.label })), { id: "action", label: "On pull requests" }];

  return (
    <>
      <div className="ways" role="tablist" aria-label="Ways to use FixMap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`way-${tab.id}`}
            type="button"
            role="tab"
            className="way"
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              const index = tabs.findIndex((entry) => entry.id === active);
              const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
              setActive(next.id);
              document.getElementById(`way-${next.id}`)?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {ways.map((way) => (
        <div key={way.id} id={`panel-${way.id}`} role="tabpanel" aria-labelledby={`way-${way.id}`} className="way-panel" hidden={active !== way.id}>
          <p>{way.intro}</p>
          {way.commands.map((command) => <CopyCommand key={command} command={command} />)}
        </div>
      ))}
      <div id="panel-action" role="tabpanel" aria-labelledby="way-action" className="way-panel" hidden={active !== "action"}>
        <p>Posts FixMap&apos;s starting list as a comment on every pull request. Save this as <code>.github/workflows/fixmap.yml</code>.</p>
        <pre className="block" tabIndex={0}><code>{workflow}</code></pre>
      </div>
    </>
  );
}
