import Link from "next/link";
import { Brand } from "./logo";
import { marketplaceUrl, npmUrl, repoUrl, siteStats } from "../_lib/site-data";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <Brand />
        <span>v{siteStats.version} · MIT licensed · runs on your computer</span>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/docs">Docs</Link>
          <Link href="/evidence">Evidence</Link>
          <Link href="/changelog">Changelog</Link>
          <a href={repoUrl}>GitHub</a>
          <a href={npmUrl}>npm</a>
          <a href={marketplaceUrl}>GitHub Action</a>
          <a href={`${repoUrl}/issues`}>Report a problem</a>
        </nav>
      </div>
    </footer>
  );
}
