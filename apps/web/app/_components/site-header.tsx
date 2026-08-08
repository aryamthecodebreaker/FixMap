import Link from "next/link";
import { CaretDown, GithubLogo, List } from "@phosphor-icons/react/ssr";
import { Logo } from "./logo";
import { repoUrl } from "../_lib/site-data";
import { ThemeToggle } from "./theme-toggle";

const links = [
  { href: "/product", label: "Product" },
  { href: "/demo", label: "Live demo" },
  { href: "/evidence", label: "Evidence" },
  { href: "/changelog", label: "Changelog" },
  { href: "/docs", label: "Docs" }
];

function NavLinks() {
  return (
    <>
      {links.map((link) => (
        <Link key={link.href} href={link.href}>{link.label}</Link>
      ))}
      <details className="nav-dropdown">
        <summary>
          Get started <CaretDown size={14} weight="bold" aria-hidden />
        </summary>
        <div className="nav-dropdown-panel">
          <Link href="/get-started#cli"><strong>CLI</strong><span>Run FixMap from a terminal</span></Link>
          <Link href="/get-started#mcp"><strong>MCP</strong><span>Connect a coding agent</span></Link>
          <Link href="/get-started#action"><strong>GitHub Action</strong><span>Map every pull request</span></Link>
        </div>
      </details>
      <a className="nav-github" href={repoUrl}>
        <GithubLogo size={18} weight="fill" aria-hidden /> GitHub
      </a>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavLinks />
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <details className="mobile-menu">
            <summary aria-label="Open navigation"><List size={25} weight="bold" aria-hidden /></summary>
            <nav aria-label="Mobile navigation"><NavLinks /></nav>
          </details>
        </div>
      </div>
    </header>
  );
}
