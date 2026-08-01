import Link from "next/link";
import { GithubLogo } from "@phosphor-icons/react/ssr";
import { Logo } from "./logo";
import { marketplaceUrl, npmUrl, repoUrl, siteStats } from "../_lib/site-data";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Logo inverse />
          <p>A practical map before the first edit. Free, local-first, and open source.</p>
        </div>
        <div className="footer-links">
          <div><strong>Explore</strong><Link href="/product">Product</Link><Link href="/demo">Live demo</Link><Link href="/evidence">Evidence</Link></div>
          <div><strong>Use FixMap</strong><Link href="/get-started">Get started</Link><Link href="/docs">Docs</Link><a href={marketplaceUrl}>GitHub Action</a></div>
          <div><strong>Project</strong><a href={repoUrl}><GithubLogo size={16} weight="fill" aria-hidden /> GitHub</a><a href={npmUrl}>npm</a><a href={`${repoUrl}/issues`}>Issues</a></div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>FixMap v{siteStats.version}</span>
        <span>MIT licensed</span>
        <span>Made in the open</span>
      </div>
    </footer>
  );
}
