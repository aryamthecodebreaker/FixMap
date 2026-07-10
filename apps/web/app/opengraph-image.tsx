import { ImageResponse } from "next/og";

export const alt = "FixMap — Give coding agents a map before they edit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, color: "#f1f7f4", background: "radial-gradient(circle at 80% 0%, #174735, #070a09 55%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, fontWeight: 700 }}>
        <div style={{ width: 58, height: 58, border: "2px solid #74f0ba", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#74f0ba", fontSize: 20 }}>FM</div>
        FixMap
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
        <div style={{ color: "#74f0ba", fontSize: 22, marginBottom: 22 }}>OPEN-SOURCE REPO INTELLIGENCE</div>
        <div style={{ fontSize: 66, lineHeight: 1.05, letterSpacing: -3 }}>Give your coding agent a map before it starts editing.</div>
      </div>
      <div style={{ display: "flex", gap: 30, color: "#99aaa3", fontSize: 19 }}><span>Local first</span><span>Transparent ranking</span><span>No API key</span></div>
    </div>,
    size
  );
}
