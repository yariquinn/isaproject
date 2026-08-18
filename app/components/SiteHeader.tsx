import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          Isa Abdur-Rahman, PLLC
          <small>Attorney at Law</small>
        </Link>
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/attorney-bio">Attorney Bio</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/login" className="nav-login">
            Attorney Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
