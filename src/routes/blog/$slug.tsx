import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { blogPosts, findBlogPost, formatDate, type BlogPost } from "@/data/blog";

const RSS_LINK = [{ rel: "alternate", type: "application/rss+xml", title: "Patron notes RSS", href: "/blog/rss" }];

export const Route = createFileRoute("/blog/$slug")({
  head: ({ params }) => {
    const post = findBlogPost(params.slug);
    const meta = post
      ? [{ title: `${post.title} | Patron` }, { name: "description", content: post.excerpt }]
      : [{ title: "Notes on loyalty | Patron" }];
    return { meta, links: RSS_LINK };
  },
  component: BlogPost,
});

function BlogPost() {
  const { slug } = Route.useParams();
  const found = findBlogPost(slug);
  if (!found) throw notFound();
  const post: BlogPost = found;
  const index: number = blogPosts.findIndex((item) => item.slug === post.slug);
  const next: BlogPost | undefined = blogPosts[index - 1] ?? blogPosts[blogPosts.length - 1];
  return (
    <MarketingShell>
      <article className="section page-width blog-post">
        <p className="demo-data-note">
          {formatDate(post.date)} · {post.readMinutes} minute read
        </p>
        {!post.reviewed && (
          <p className="blog-banner" role="status">
            Placeholder draft, not final
          </p>
        )}
        <h1>{post.title}</h1>
        {post.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </section>
        ))}
        <div className="page-cta-row">
          <a className="builder-primary" href="/find">
            Find a place on Patron
          </a>
          <a className="builder-secondary" href="/contact">
            Book a visit
          </a>
        </div>
        {next && next.slug !== post.slug && (
          <p className="blog-next demo-data-note">
            Read next: <a href={`/blog/${next.slug}`}>{next.title}</a>
          </p>
        )}
      </article>
    </MarketingShell>
  );
}
