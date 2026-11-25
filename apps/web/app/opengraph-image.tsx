import { ImageResponse } from "next/og";

export const alt = "FixMap — tell your AI coding tool which files to check first";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const green = "#4cc38a";

export default async function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 64, color: "#e8edf3", background: "#0b0e12" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
        <svg width="52" height="52" viewBox="0 0 32 32" fill="none">
          <path d="M8 22.5V17a5 5 0 0 1 5-5h6a5 5 0 0 0 5-5V6.5" stroke={green} strokeWidth="3" strokeLinecap="round" />
          <circle cx="8" cy="25" r="4" stroke={green} strokeWidth="3" />
          <circle cx="16" cy="12" r="2.6" fill={green} />
          <circle cx="24" cy="5.5" r="4.5" fill="#8fe0b4" stroke={green} strokeWidth="2" />
        </svg>
        FixMap
      </div>
      <div style={{ display: "flex", marginTop: 44, fontSize: 70, lineHeight: 1.04, letterSpacing: -3, fontWeight: 700, maxWidth: 1000 }}>
        Tell your AI coding tool which files to check first.
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", border: "2px solid #364353", borderRadius: 14, background: "#10151b" }}>
        <div style={{ display: "flex", gap: 14, padding: "14px 22px", borderBottom: "2px solid #222b36", fontSize: 22, color: "#a9b5c3" }}>
          <span style={{ color: green, fontWeight: 700 }}>FixMap</span> commented on src/auth/reset-password.ts line 18
        </div>
        <div style={{ display: "flex", padding: "16px 22px", fontSize: 26 }}>Start here: this file defines TOKEN_TTL_MINUTES. Then run npm run test.</div>
      </div>
    </div>,
    size
  );
}
