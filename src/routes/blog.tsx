import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { blogPosts, formatDate } from "@/data/blog";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Notes on loyalty | Patron" },
      {
        name: "description",
        content:
          "Short, practical notes on restaurant loyalty: cards that work, quiet days worth working, and SMS that respects the guest.",
      },
    ],
    links: [{ rel: "alternate", type: "application/rss+xml", title: "Patron notes RSS", href: "/blog/rss" }],
  }),
  component: BlogList,
});

function BlogList() {
  return (
    <MarketingShell>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Notes
        </span>
        <h1>
          Notes on <span className="editorial">loyalty.</span>
        </h1>
        <p>
          Short notes for restaurant owners on what keeps regulars coming back. Written from the tools we
          build, with the research behind them linked in.
        </p>
      </section>
      <section className="section page-width">
        <div className="blog-list">
          {blogPosts.map((post) => (
            <article className="blog-card" key={post.slug}>
              <p className="demo-data-note">
                {formatDate(post.date)} · {post.readMinutes} minute read
              </p>
              <h2>
                <a href={`/blog/${post.slug}`}>{post.title}</a>
              </h2>
              <p>{post.excerpt}</p>
              <a className="text-link" href={`/blog/${post.slug}`}>
                Read the note
              </a>
            </article>
          ))}
        </div>
        <p className="demo-data-note">
          The RSS feed for these notes is at <a href="/blog/rss">/blog/rss</a>.
        </p>
      </section>
    </MarketingShell>
  );
}
