import { describe, expect, it } from "vitest";
import {
  buildDotnetProjects,
  dotnetProjectForPath,
  dotnetReferenceClosure,
  referencingDotnetTestProjects
} from "../src/dotnet-projects.js";
import type { RepoFile } from "../src/types.js";

function project(path: string, textSample = "<Project />"): RepoFile {
  return {
    path,
    extension: path.slice(path.lastIndexOf(".")),
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: "config",
    textSample
  };
}

describe(".NET project evidence", () => {
  it("normalizes literal references, rejects unresolved paths, and preserves canonical case", () => {
    const projects = buildDotnetProjects([
      project("src/App/App.csproj", [
        "<Project>",
        '  <ProjectReference Include="..\\LIB\\Lib.csproj" />',
        '  <ProjectReference Include="$(SharedRoot)\\Shared.csproj" />',
        '  <ProjectReference Include="..\\..\\..\\outside.csproj" />',
        '  <ProjectReference Include="C:\\outside\\Absolute.csproj" />',
        "</Project>"
      ].join("\n")),
      project("src/Lib/Lib.csproj")
    ]);

    expect(projects.find((entry) => entry.path === "src/App/App.csproj")?.references)
      .toEqual(["src/Lib/Lib.csproj"]);
  });

  it("keeps project ownership unambiguous and follows transitive references", () => {
    const projects = buildDotnetProjects([
      project("src/App/App.csproj", '<ProjectReference Include="..\\Services\\Services.csproj" />'),
      project("src/Services/Services.csproj", '<ProjectReference Include="..\\Contracts\\Contracts.csproj" />'),
      project("src/Contracts/Contracts.csproj"),
      project("RootA.csproj"),
      project("RootB.csproj")
    ]);

    expect(dotnetProjectForPath(projects, "src/App/Program.cs")?.path).toBe("src/App/App.csproj");
    expect(dotnetProjectForPath(projects, "Program.cs")).toBeUndefined();
    expect([...dotnetReferenceClosure(projects, "src/App/App.csproj")].sort()).toEqual([
      "src/App/App.csproj",
      "src/Contracts/Contracts.csproj",
      "src/Services/Services.csproj"
    ]);
  });

  it("finds only test projects whose reference closure reaches the source project", () => {
    const projects = buildDotnetProjects([
      project("src/App/App.csproj"),
      project("tests/App.UnitTests/App.UnitTests.csproj", [
        "<Project>",
        '  <ProjectReference Include="..\\..\\src\\App\\App.csproj" />',
        "  <IsTestProject>true</IsTestProject>",
        "</Project>"
      ].join("\n")),
      project("tests/Other.Tests/Other.Tests.csproj")
    ]);

    expect(referencingDotnetTestProjects(projects, "src/App/App.csproj").map((entry) => entry.path))
      .toEqual(["tests/App.UnitTests/App.UnitTests.csproj"]);
  });
});
