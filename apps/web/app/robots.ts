import type { MetadataRoute } from "next";

const base = "https://usefixmap.vercel.app";

// The layout's `robots: { index: true, follow: true }` metadata only emits a per-page meta
// tag; it never produces the file crawlers request first, so /robots.txt returned a 404 and
// the sitemap went unadvertised.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${base}/sitemap.xml`,
    host: base
  };
}
