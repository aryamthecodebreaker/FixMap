import { describe, expect, it } from "vitest";

import { runDoctorChecks } from "../src/doctor.js";

function dependencies(runningVersion: string, requestedPackage: string | undefined) {
  return {
    readVersion: () => runningVersion,
    requestedPackage: () => requestedPackage,
    resolveBinary: async () => undefined,
    globalVersion: async () => undefined,
    nodeVersion: () => "24.13.0",
    modulePath: () => "C:/clean-prefix/node_modules/@aryam/fixmap/dist/doctor.js"
  };
}

describe("runDoctorChecks", () => {
  it("reports an exact npm exec request that resolved to an older ancestor install", async () => {
    const report = await runDoctorChecks(dependencies("0.8.1", "@aryam/fixmap@0.8.3"));

    expect(report.healthy).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        label: "Requested package",
        value: "0.8.3 (this process is 0.8.1)",
        ok: false
      })
    );
  });

  it("reports a matching exact npm exec request as healthy", async () => {
    const report = await runDoctorChecks(dependencies("0.8.3", "@aryam/fixmap@0.8.3"));

    expect(report.healthy).toBe(true);
    expect(report.findings).toContainEqual({
      label: "Requested package",
      value: "0.8.3 (matches)",
      ok: true
    });
  });

  it("does not claim an intended version for non-exact package requests", async () => {
    const report = await runDoctorChecks(dependencies("0.8.3", "@aryam/fixmap@latest"));

    expect(report.healthy).toBe(true);
    expect(report.findings.some((finding) => finding.label === "Requested package")).toBe(false);
  });
});
