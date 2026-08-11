"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useRef, useState } from "react";

export function CopyCommand({ command, label = "Copy command" }: { command: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const codeRef = useRef<HTMLElement>(null);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      const code = codeRef.current;
      if (code) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setState("manual");
    }
    window.setTimeout(() => setState("idle"), 2400);
  }

  return (
    <div className="copy-command">
      <code ref={codeRef}>{command}</code>
      <button type="button" onClick={copy} aria-label={label}>
        {state === "copied" ? <Check size={18} weight="bold" aria-hidden /> : <Copy size={18} aria-hidden />}
        <span aria-live="polite">{state === "copied" ? "Copied" : state === "manual" ? "Press Ctrl+C" : "Copy"}</span>
      </button>
    </div>
  );
}
