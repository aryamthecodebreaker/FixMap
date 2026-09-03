import { describe, expect, it } from "vitest";

import { collapseEquivalentWindowsShims, runDoctorChecks } from "../src/doctor.js";

function dependencies(runningVersion: string, requestedPackage: string | undefined) {
  return {
    readVersion: () => runningVersion,
    requestedPackage: () => requestedPackage,
    resolveBinary: async () => undefined,
    globalVersion: async () => undefined,
    projectVersion: async () => undefined,
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

  it("always reports the PATH state when no fixmap binary is installed", async () => {
    const report = await runDoctorChecks(dependencies("0.8.8", undefined));

    expect(report.findings).toContainEqual(expect.objectContaining({
      label: "fixmap on PATH",
      value: "not on PATH",
      ok: true
    }));
  });

  it("reports every PATH binary so duplicate installs cannot hide", async () => {
    const report = await runDoctorChecks({
      ...dependencies("0.8.8", undefined),
      resolveBinaries: async () => ["C:/npm/fixmap.cmd", "D:/tools/fixmap.cmd"]
    });

    expect(report.healthy).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      label: "fixmap on PATH",
      value: "C:/npm/fixmap.cmd; D:/tools/fixmap.cmd",
      ok: false
    }));
  });

  it("treats npm's same-directory Windows launchers as one installation", async () => {
    const report = await runDoctorChecks({
      ...dependencies("0.9.0", undefined),
      resolveBinaries: async () => [
        "C:\\Users\\arya\\AppData\\Roaming\\npm\\fixmap",
        "C:\\Users\\arya\\AppData\\Roaming\\npm\\fixmap.cmd",
        "C:\\Users\\arya\\AppData\\Roaming\\npm\\fixmap.ps1"
      ]
    });

    expect(report.healthy).toBe(true);
    expect(report.findings).toContainEqual(expect.objectContaining({
      label: "fixmap on PATH",
      value: "C:\\Users\\arya\\AppData\\Roaming\\npm\\fixmap",
      ok: true
    }));
  });

  it("keeps same-named launchers in different directories distinct", () => {
    expect(collapseEquivalentWindowsShims([
      "C:/npm/fixmap.cmd",
      "C:/npm/fixmap.ps1",
      "D:/tools/fixmap.cmd"
    ])).toEqual(["C:/npm/fixmap.cmd", "D:/tools/fixmap.cmd"]);
  });

  it("flags a stale project-local package that can shadow the running version", async () => {
    const report = await runDoctorChecks({
      ...dependencies("0.8.8", undefined),
      projectVersion: async () => ({ version: "0.8.7", path: "C:/repo/node_modules/@aryam/fixmap/package.json" })
    });

    expect(report.healthy).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      label: "Project install",
      value: expect.stringContaining("0.8.7"),
      ok: false
    }));
  });
});
