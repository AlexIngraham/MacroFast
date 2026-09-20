import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="MacroFast home">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MacroFast</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/foods">Find food</Link>
          <Link href="/restaurants">Restaurants</Link>
          <Link href="/compare">Compare</Link>
        </nav>
      </div>
    </header>
  );
}
