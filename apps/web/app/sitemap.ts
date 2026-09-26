import type { MetadataRoute } from "next";

const base = "https://fixmap.aryam.me";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/product", "/use-cases", "/demo", "/evidence", "/changelog", "/get-started", "/docs"].map((path) => ({
    url: `${base}${path}`
  }));
}
