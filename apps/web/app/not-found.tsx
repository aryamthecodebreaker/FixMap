import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

export default function NotFound() {
  return <main><section className="subpage-hero compact-hero page-shell not-found"><p className="eyebrow">404 · Route not found</p><h1>This path is not <em>on the map.</em></h1><p>The page may have moved, or the address may be incomplete.</p><Link className="button primary" href="/"><ArrowLeft size={18} weight="bold" aria-hidden /> Back to FixMap</Link></section></main>;
}
