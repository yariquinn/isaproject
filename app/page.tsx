import Link from "next/link";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Real Estate &middot; Business Law &middot; Family Estates</p>
        <h1>The Law Office of Isa Abdur-Rahman, PLLC</h1>
        <p>
          Representing buyers, sellers, builders, and financiers of real estate
          and businesses throughout New York since 2004.
        </p>
        <Link href="/contact" className="btn">
          Request a Consultation
        </Link>
      </section>

      <section className="block">
        <div className="container">
          <h2 className="section-title">Practice Areas</h2>
          <p className="section-sub">
            Focused counsel across three connected areas of law that help
            individuals, families, and institutions build and protect wealth.
          </p>
          <div className="cards">
            <div className="card">
              <h3>Real Estate</h3>
              <p>
                Guidance for buyers, sellers, builders, and financiers &mdash;
                including real estate litigation involving construction, fraud
                claims, title disputes, and contract claims.
              </p>
            </div>
            <div className="card">
              <h3>Business Law</h3>
              <p>
                Counsel for businesses and their owners, from formation and
                transactions to resolving business disputes.
              </p>
            </div>
            <div className="card">
              <h3>Family Estates</h3>
              <p>
                Estate planning and generational wealth strategies that help
                families preserve and transfer property across generations.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="block alt">
        <div className="container prose">
          <h2 className="section-title">Who We Serve</h2>
          <p style={{ textAlign: "center" }}>
            The Law Office of Isa Abdur-Rahman, PLLC represents buyers, sellers,
            builders, and financiers of real estate and businesses located
            within New York. Our clients include individuals, families, estates,
            lenders, non-profit organizations, and faith-based institutions.
          </p>
        </div>
      </section>
    </main>
  );
}
