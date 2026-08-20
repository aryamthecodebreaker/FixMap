import type { MetadataRoute } from "next";

const base = "https://usefixmap.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/product", "/demo", "/evidence", "/changelog", "/get-started", "/docs"].map((path) => ({
    url: `${base}${path}`
  }));
}
