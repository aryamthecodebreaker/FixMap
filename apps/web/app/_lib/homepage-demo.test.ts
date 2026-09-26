import { describe, expect, it } from "vitest";
import {
  buildHomepageReport,
  homepageDefaultEvidence,
  homepageDefaultReport,
  homepageDefaultTask,
  selectHomepageEvidence
} from "./homepage-demo";

describe("homepage FixMap demo", () => {
  it("keeps the default task backed by file, test, impact, and risk evidence", () => {
    expect(homepageDefaultTask).toContain("TOKEN_TTL_MINUTES");
    expect(homepageDefaultEvidence.editCandidate?.path).toBe("src/auth/reset-password.ts");
    expect(homepageDefaultEvidence.testRoute?.command).toBe("npm run test");
    expect(homepageDefaultEvidence.impactFile?.path).toBe("src/auth/token-store.ts");
    expect(homepageDefaultEvidence.risk?.area).toBe("authentication");
    expect(homepageDefaultReport.diagnostics).toEqual([]);
  });

  it("moves a named email symbol to the top using the real engine", () => {
    const report = buildHomepageReport("sendMail throws and password reset emails never arrive");

    expect(report.contextFiles[0]?.path).toBe("src/email/transport.ts");
    expect(report.contextFiles[0]?.reasons.join(" ")).toContain("sendMail");
  });

  it("maps invoice duplication to the billing subsystem", () => {
    const report = buildHomepageReport("Invoices are created twice for the same customer");
    const evidence = selectHomepageEvidence(report);

    expect(report.contextFiles[0]?.path).toBe("src/billing/invoice.ts");
    expect(report.risks.some((risk) => risk.area === "billing")).toBe(true);
    expect(evidence.risk?.area).toBe("billing");
  });

  it("preserves the genuine vague-task decline without fallback output", () => {
    const report = buildHomepageReport("make it better");

    expect(report.contextFiles).toEqual([]);
    expect(report.testRoutes).toEqual([]);
    expect(report.impact?.files ?? []).toEqual([]);
    expect(report.risks).toEqual([]);
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "vague-task",
      "no-context-match"
    ]));
  });
});
