import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell page-head" style={{ borderBottom: 0, paddingBottom: 96 }}>
      <h1>Nothing at this address</h1>
      <p>The page may have moved when the site was simplified. Everything now lives on four pages.</p>
      <div className="closing" style={{ padding: "24px 0 0" }}>
        <div className="actions">
          <Link className="btn btn-primary" href="/">Home</Link>
          <Link className="btn btn-quiet" href="/docs">Docs</Link>
          <Link className="btn btn-quiet" href="/evidence">Evidence</Link>
          <Link className="btn btn-quiet" href="/changelog">Changelog</Link>
        </div>
      </div>
    </div>
  );
}
