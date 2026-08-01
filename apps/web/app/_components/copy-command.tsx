"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

export function CopyCommand({ command, label = "Copy command" }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="copy-command">
      <code>{command}</code>
      <button type="button" onClick={copy} aria-label={label}>
        {copied ? <Check size={18} weight="bold" aria-hidden /> : <Copy size={18} aria-hidden />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
