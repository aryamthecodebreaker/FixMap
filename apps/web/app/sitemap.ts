import type { MetadataRoute } from "next";

const base = "https://usefixmap.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/product", "/use-cases", "/demo", "/evidence", "/changelog", "/get-started", "/docs"].map((path) => ({
    url: `${base}${path}`
  }));
}
