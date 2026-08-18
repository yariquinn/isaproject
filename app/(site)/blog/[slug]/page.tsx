import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, POSTS } from "@/lib/posts";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  return {
    title: post
      ? `${post.title} – The Law Office of Isa Abdur-Rahman, PLLC`
      : "Blog",
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">{post.date}</p>
        <h1>{post.title}</h1>
      </section>

      <section className="block">
        <div className="container prose">
          {post.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          <p style={{ marginTop: "2rem" }}>
            <Link href="/blog">← Back to all posts</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
