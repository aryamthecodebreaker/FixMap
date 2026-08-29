"use client";

import { useRef, useState } from "react";
import { ArrowSquareOut, Check, Copy, Robot, X } from "@phosphor-icons/react";

export const FIXMAP_EXPLANATION_PROMPT = `Help me understand FixMap.

FixMap is an open-source, deterministic, local-first repository intelligence tool for coding agents and developers.

It analyzes a software repository and a task, then uses repository evidence to identify likely relevant code, structural relationships, test or validation routes, risk areas, uncertainty, and useful investigation context.

FixMap does not generate code and does not use an LLM internally.

Its purpose is to help developers and coding agents understand where to investigate before making changes, rather than blindly searching or loading large portions of a repository.

Website:
[https://usefixmap.vercel.app](https://usefixmap.vercel.app)

GitHub:
https://github.com/aryamthecodebreaker/FixMap

Please:

1. Explain FixMap to me in simple, practical language.
2. Give me a realistic example of when I would use it.
3. Explain how it differs from normal grep/search, BM25-style code retrieval, and an AI coding agent searching a repository by itself.
4. Explain what FixMap does NOT do.
5. Ask what coding tool or workflow I use, then tailor any follow-up explanation to that workflow.

Do not assume features that are not supported by the information above. If you are unsure about something, say so.`;

export const AI_PROVIDERS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "Gemini", url: "https://gemini.google.com/app" }
] as const;

type BrowserActions = {
  copy: (text: string) => Promise<void>;
  open: (url: string) => Window | null;
};

export type ProviderActionResult = "copied-and-opened" | "copied-popup-blocked" | "copy-failed-opened" | "copy-failed-popup-blocked";

export async function launchProvider(
  provider: (typeof AI_PROVIDERS)[number],
  actions: BrowserActions
): Promise<ProviderActionResult> {
  const providerWindow = actions.open(provider.url);
  let copied = false;

  try {
    await actions.copy(FIXMAP_EXPLANATION_PROMPT);
    copied = true;
  } catch {
    copied = false;
  }

  if (copied && providerWindow) return "copied-and-opened";
  if (copied) return "copied-popup-blocked";
  if (providerWindow) return "copy-failed-opened";
  return "copy-failed-popup-blocked";
}

export function openProviderDialog(dialog: HTMLDialogElement | null) {
  if (dialog && !dialog.open) dialog.showModal();
}

function resultMessage(result: ProviderActionResult, provider: string) {
  switch (result) {
    case "copied-and-opened": return `Prompt copied. Paste it into ${provider}.`;
    case "copied-popup-blocked": return `Prompt copied, but ${provider} was blocked. Allow popups, then try again.`;
    case "copy-failed-opened": return `${provider} opened, but the prompt could not be copied. Use “Copy prompt” below.`;
    case "copy-failed-popup-blocked": return `The popup and clipboard were blocked. Allow access, then try again.`;
  }
}

export function AiExplainer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState("");

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(FIXMAP_EXPLANATION_PROMPT);
      setStatus("Prompt copied. Open an AI service and paste it there.");
    } catch {
      setStatus("Your browser blocked clipboard access. Select and copy the prompt below.");
    }
  };

  const chooseProvider = async (provider: (typeof AI_PROVIDERS)[number]) => {
    const result = await launchProvider(provider, {
      copy: (text) => navigator.clipboard.writeText(text),
      open: (url) => {
        const providerWindow = window.open("about:blank", "_blank");
        if (providerWindow) {
          providerWindow.opener = null;
          providerWindow.location.replace(url);
        }
        return providerWindow;
      }
    });
    setStatus(resultMessage(result, provider.name));
  };

  return (
    <>
      <button className="button ai-explainer-trigger" type="button" onClick={() => openProviderDialog(dialogRef.current)}>
        <Robot size={17} aria-hidden /> Explain FixMap with AI
      </button>
      <dialog className="ai-explainer-dialog" ref={dialogRef} aria-labelledby="ai-explainer-title" aria-describedby="ai-explainer-description">
        <div className="ai-explainer-heading">
          <div>
            <span>Optional explainer</span>
            <h2 id="ai-explainer-title">Choose an AI service</h2>
          </div>
          <button className="ai-explainer-close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close AI provider chooser">
            <X size={19} aria-hidden />
          </button>
        </div>
        <p id="ai-explainer-description">We’ll copy a prepared prompt, then open the service. Paste the prompt there to ask questions. FixMap itself does not use AI.</p>
        <div className="ai-provider-list" role="list" aria-label="AI providers">
          {AI_PROVIDERS.map((provider) => (
            <button type="button" role="listitem" key={provider.name} onClick={() => void chooseProvider(provider)} aria-label={`Copy the FixMap explanation prompt and open ${provider.name}`}>
              <span><strong>{provider.name}</strong><small>Copy prompt, then open</small></span>
              <ArrowSquareOut size={18} aria-hidden />
            </button>
          ))}
        </div>
        <div className="ai-explainer-fallback">
          <button type="button" onClick={() => void copyPrompt()}><Copy size={16} aria-hidden /> Copy prompt</button>
          <p className="ai-explainer-status" role="status" aria-live="polite">{status}</p>
        </div>
        <details className="ai-explainer-prompt">
          <summary>View prompt</summary>
          <pre>{FIXMAP_EXPLANATION_PROMPT}</pre>
        </details>
        <form method="dialog"><button className="ai-explainer-done" type="submit"><Check size={16} aria-hidden /> Done</button></form>
      </dialog>
    </>
  );
}
