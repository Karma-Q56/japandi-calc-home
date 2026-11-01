import { createFileRoute } from "@tanstack/react-router";
import { blogPosts } from "@/data/blog";

export const Route = createFileRoute("/blog/rss")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const escape = (value: string) =>
          value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        const items = blogPosts
          .map((post) => {
            const link = `${origin}/blog/${post.slug}`;
            return [
              "  <item>",
              `    <title>${escape(post.title)}</title>`,
              `    <link>${escape(link)}</link>`,
              `    <guid>${escape(link)}</guid>`,
              `    <pubDate>${new Date(`${post.date}T06:00:00Z`).toUTCString()}</pubDate>`,
              `    <description>${escape(post.excerpt)}</description>`,
              "  </item>",
            ].join("\n");
          })
          .join("\n");
        const latest = blogPosts[0]?.date ?? "2026-10-28";
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0">`,
          `<channel>`,
          `  <title>Patron notes on loyalty</title>`,
          `  <link>${escape(origin)}/blog</link>`,
          `  <description>Short notes for restaurant owners on loyalty, quiet days and guest messages.</description>`,
          `  <language>en-za</language>`,
          `  <lastBuildDate>${new Date(`${latest}T06:00:00Z`).toUTCString()}</lastBuildDate>`,
          items,
          `</channel>`,
          `</rss>`,
        ].join("\n");
        return new Response(xml, {
          headers: { "content-type": "application/rss+xml; charset=utf-8" },
        });
      },
    },
  },
});
