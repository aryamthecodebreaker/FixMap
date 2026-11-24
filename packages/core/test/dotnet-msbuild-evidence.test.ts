import { describe, expect, it } from "vitest";
import {
  buildDotnetProjects,
  buildDotnetSolutions,
  dotnetProjectForPath
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

function source(path: string, textSample: string): RepoFile {
  return { ...project(path, textSample), extension: ".cs", kind: "code" };
}

describe(".NET MSBuild evidence beyond project files", () => {
  it("collects literal projects from XML .slnx solutions, including nested folders", () => {
    const files = [
      project("App.slnx", [
        "<Solution>",
        '  <Folder Name="/src/">',
        '    <Project Path="src/App/App.csproj" />',
        "  </Folder>",
        '  <Project Path="tests\\App.Tests\\App.Tests.csproj" />',
        '  <Project Path="$(Root)/Dynamic.csproj" />',
        '  <Project Path="../Outside.csproj" />',
        "</Solution>"
      ].join("\n")),
      project("src/App/App.csproj"),
      project("tests/App.Tests/App.Tests.csproj")
    ];
    expect(buildDotnetSolutions(files)).toEqual([{
      path: "App.slnx",
      root: "",
      projects: ["src/App/App.csproj", "tests/App.Tests/App.Tests.csproj"]
    }]);
  });

  it("applies the nearest Directory.Build.props and .targets, following parent chains and literal imports", () => {
    const projects = buildDotnetProjects([
      project("Directory.Build.props", '<Project><ItemGroup><Using Include="Acme.Root" /></ItemGroup></Project>'),
      project("src/Directory.Build.props", [
        "<Project>",
        `  <Import Project="$([MSBuild]::GetPathOfFileAbove('Directory.Build.props', '$(MSBuildThisFileDirectory)../'))" />`,
        '  <Import Project="$(MSBuildThisFileDirectory)build/Shared.props" />',
        '  <Import Project="$(SomeRoot)/Ignored.props" />',
        '  <ItemGroup><Using Include="Acme.Src" /><Using Remove="Acme.Root" /></ItemGroup>',
        "</Project>"
      ].join("\n")),
      project("src/build/Shared.props", '<Project><ItemGroup><Using Include="Acme.Shared" /></ItemGroup></Project>'),
      project("src/Directory.Build.targets", '<Project><ItemGroup><Using Include="Acme.Late" /></ItemGroup></Project>'),
      project("src/App/App.csproj", '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><Using Include="Acme.Root" /></ItemGroup></Project>'),
      project("other/Other.csproj", '<Project Sdk="Microsoft.NET.Sdk" />')
    ]);
    const app = projects.find((entry) => entry.path === "src/App/App.csproj")!;
    // src props removed Acme.Root and the project added it back; Acme.Late comes from .targets.
    expect(app.globalUsings).toEqual(["Acme.Late", "Acme.Root", "Acme.Shared", "Acme.Src"]);
    expect(app.buildFiles).toEqual(["Directory.Build.props", "src/build/Shared.props", "src/Directory.Build.props", "src/Directory.Build.targets"]);
    const other = projects.find((entry) => entry.path === "other/Other.csproj")!;
    expect(other.globalUsings).toEqual(["Acme.Root"]);
    expect(other.buildFiles).toEqual(["Directory.Build.props"]);
  });

  it("does not loop on import cycles", () => {
    const projects = buildDotnetProjects([
      project("Directory.Build.props", '<Project><Import Project="a.props" /></Project>'),
      project("a.props", '<Project><Import Project="Directory.Build.props" /><ItemGroup><Using Include="Acme.A" /></ItemGroup></Project>'),
      project("App/App.csproj")
    ]);
    expect(projects[0]!.globalUsings).toEqual(["Acme.A"]);
  });

  it("expands SDK implicit usings for C# projects, honoring Using Remove and props-level ImplicitUsings", () => {
    const projects = buildDotnetProjects([
      project("Directory.Build.props", "<Project><PropertyGroup><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>"),
      project("web/Web.csproj", '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup><Using Remove="System.Net.Http" /></ItemGroup></Project>'),
      project("lib/Lib.csproj", '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><ImplicitUsings>disable</ImplicitUsings></PropertyGroup></Project>'),
      project("fs/Lib.fsproj", '<Project Sdk="Microsoft.NET.Sdk" />')
    ]);
    const usings = (path: string) => projects.find((entry) => entry.path === path)!.globalUsings;
    expect(usings("web/Web.csproj")).toContain("Microsoft.AspNetCore.Builder");
    expect(usings("web/Web.csproj")).toContain("System.Linq");
    expect(usings("web/Web.csproj")).not.toContain("System.Net.Http");
    expect(usings("lib/Lib.csproj")).toEqual([]);
    expect(usings("fs/Lib.fsproj")).toEqual([]);
  });

  it("owns literal linked compile items outside the project directory, failing closed when several projects link a file", () => {
    const projects = buildDotnetProjects([
      project("src/App/App.csproj", [
        "<Project><ItemGroup>",
        '  <Compile Include="..\\..\\shared\\Clock.cs" Link="Clock.cs" />',
        '  <Compile Include="..\\..\\shared\\Both.cs" />',
        '  <Compile Include="$(Root)\\Dyn.cs" />',
        "</ItemGroup></Project>"
      ].join("\n")),
      project("src/Tool/Tool.csproj", '<Project><ItemGroup><Compile Include="../../shared/Both.cs" /></ItemGroup></Project>'),
      source("shared/Clock.cs", "namespace Acme.Shared; public class Clock {}"),
      source("shared/Both.cs", "namespace Acme.Shared; public class Both {}")
    ]);
    expect(projects.find((entry) => entry.path === "src/App/App.csproj")!.linkedSources).toEqual(["shared/Both.cs", "shared/Clock.cs"]);
    expect(dotnetProjectForPath(projects, "shared/Clock.cs")?.path).toBe("src/App/App.csproj");
    expect(dotnetProjectForPath(projects, "shared/Both.cs")).toBeUndefined();
  });
});
