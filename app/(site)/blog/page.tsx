import Link from "next/link";
import { POSTS } from "@/lib/posts";

export const metadata = {
  title: "Blog – The Law Office of Isa Abdur-Rahman, PLLC",
};

export default function BlogIndex() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Insights</p>
        <h1>Blog</h1>
        <p>
          Notes on real estate, business law, and building generational wealth.
        </p>
      </section>

      <section className="block">
        <div className="container">
          <div className="post-list">
            {POSTS.map((p) => (
              <article key={p.slug} className="post-card">
                <span className="post-date">{p.date}</span>
                <h2>
                  <Link href={`/blog/${p.slug}`}>{p.title}</Link>
                </h2>
                <p>{p.excerpt}</p>
                <Link href={`/blog/${p.slug}`} className="post-more">
                  Read more →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
