import type { MetadataRoute } from "next";

const base = "https://usefixmap.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/product", "/demo", "/evidence", "/changelog", "/get-started", "/docs"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/demo" || path === "/get-started" ? 0.9 : 0.8
  }));
}
