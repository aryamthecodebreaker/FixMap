import type { MetadataRoute } from "next";

const base = "https://usefixmap.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModifiedByPath: Record<string, Date> = {
    "": new Date("2026-08-09T00:00:00.000Z"),
    "/product": new Date("2026-08-09T00:00:00.000Z"),
    "/demo": new Date("2026-08-09T00:00:00.000Z"),
    "/evidence": new Date("2026-08-09T00:00:00.000Z"),
    "/changelog": new Date("2026-08-09T00:00:00.000Z"),
    "/get-started": new Date("2026-08-09T00:00:00.000Z"),
    "/docs": new Date("2026-08-09T00:00:00.000Z")
  };
  return ["", "/product", "/demo", "/evidence", "/changelog", "/get-started", "/docs"].map((path) => ({
    url: `${base}${path}`,
    lastModified: lastModifiedByPath[path]
  }));
}
