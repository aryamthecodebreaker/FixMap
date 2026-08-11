import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "FixMap — Start with a map, not a guess";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "fixmap-logo.png"));
  const logoSource = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 68, color: "#0a213b", background: "#f7f4ec" }}>
      <img src={logoSource} alt="" width={260} height={66} style={{ objectFit: "contain" }} />
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 1020 }}>
        <div style={{ color: "#0a5a43", fontSize: 20, letterSpacing: 4, marginBottom: 22 }}>OPEN SOURCE · LOCAL FIRST · NO API KEY</div>
        <div style={{ fontSize: 78, lineHeight: 1.02, letterSpacing: -4, fontWeight: 650 }}>Start with a map, not a guess.</div>
        <div style={{ marginTop: 24, color: "#405064", fontSize: 25 }}>Files to inspect. Checks to run. Risks to review.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 18, color: "#0a5a43" }}>
        <span>Plan</span><span>→</span><span>Explain</span><span>→</span><span>Verify</span>
      </div>
    </div>,
    size
  );
}
