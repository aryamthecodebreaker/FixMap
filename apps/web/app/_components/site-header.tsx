import { GithubLogo } from "@phosphor-icons/react/ssr";
import { Brand } from "./logo";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { repoUrl } from "../_lib/site-data";
import { loadUsageStats } from "../_lib/usage-stats";

export async function SiteHeader() {
  const usage = await loadUsageStats().catch(() => null);
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <NavLinks />
        <div className="header-end">
          <a className="gh-link" href={repoUrl} aria-label="FixMap on GitHub">
            <GithubLogo size={17} weight="fill" aria-hidden />
            <span className="label-text">GitHub</span>
            {usage?.stars != null ? <span className="count">{usage.stars.toLocaleString("en-US")}</span> : null}
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
