import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AI_PROVIDERS, AiExplainer, FIXMAP_EXPLANATION_PROMPT, launchProvider, openProviderDialog } from "./ai-explainer";

describe("AI explainer", () => {
  it("renders the secondary CTA and accessible provider chooser", () => {
    const markup = renderToStaticMarkup(<AiExplainer />);
    expect(markup).toContain("Explain FixMap with AI");
    expect(markup).toContain('aria-labelledby="ai-explainer-title"');
    expect(markup).toContain('aria-label="Close AI provider chooser"');
    for (const provider of AI_PROVIDERS) expect(markup).toContain(`open ${provider.name}`);
  });

  it("keeps the prompt honest and complete", () => {
    expect(FIXMAP_EXPLANATION_PROMPT).toContain("deterministic, local-first repository intelligence tool");
    expect(FIXMAP_EXPLANATION_PROMPT).toContain("does not use an LLM internally");
    expect(FIXMAP_EXPLANATION_PROMPT).toContain("https://github.com/aryamthecodebreaker/FixMap");
    expect(FIXMAP_EXPLANATION_PROMPT).toContain("Do not assume features that are not supported");
  });

  it.each(AI_PROVIDERS)("copies the same prompt and opens $name", async (provider) => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn().mockReturnValue({} as Window);
    await expect(launchProvider(provider, { copy, open })).resolves.toBe("copied-and-opened");
    expect(copy).toHaveBeenCalledWith(FIXMAP_EXPLANATION_PROMPT);
    expect(open).toHaveBeenCalledWith(provider.url);
  });

  it("reports a popup blocker while preserving the copied prompt", async () => {
    await expect(launchProvider(AI_PROVIDERS[0], {
      copy: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockReturnValue(null)
    })).resolves.toBe("copied-popup-blocked");
  });

  it("reports clipboard failure while preserving the opened provider", async () => {
    await expect(launchProvider(AI_PROVIDERS[1], {
      copy: vi.fn().mockRejectedValue(new Error("denied")),
      open: vi.fn().mockReturnValue({} as Window)
    })).resolves.toBe("copy-failed-opened");
  });

  it("opens the native dialog once and relies on native Escape behavior", () => {
    const dialog = { open: false, showModal: vi.fn() } as unknown as HTMLDialogElement;
    openProviderDialog(dialog);
    expect(dialog.showModal).toHaveBeenCalledOnce();
  });
});
