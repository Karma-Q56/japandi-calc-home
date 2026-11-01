import { describe, expect, it } from "vitest";
import { blogPosts, findBlogPost, formatDate } from "@/data/blog";

describe("blog data", () => {
  it("keeps slugs unique and every section readable", () => {
    const slugs = blogPosts.map((post) => post.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const post of blogPosts) {
      expect(post.sections.length).toBeGreaterThan(0);
      for (const section of post.sections) {
        expect(section.paragraphs.length).toBeGreaterThan(0);
        expect(section.heading.length).toBeGreaterThan(0);
      }
    }
  });

  it("avoids em dashes in titles and paragraphs", () => {
    for (const post of blogPosts) {
      expect(post.title).not.toMatch(/[—–]/);
      expect(post.excerpt).not.toMatch(/[—–]/);
      for (const section of post.sections) {
        for (const paragraph of section.paragraphs) {
          expect(paragraph).not.toMatch(/[—–]/);
        }
      }
    }
  });

  it("finds a post by slug and misses unknown ones", () => {
    expect(findBlogPost("why-the-card-still-works")?.title).toContain("card");
    expect(findBlogPost("no-such-note")).toBeUndefined();
  });

  it("formats dates in South African English", () => {
    expect(formatDate("2026-10-28")).toContain("October 2026");
  });
});

describe("blog rss feed", () => {
  it("returns valid RSS XML for every post", async () => {
    const { Route } = await import("@/routes/blog/rss");
    const handler = Route.options.server?.handlers?.GET;
    expect(typeof handler).toBe("function");
    // Node 22 provides the global Request the server handlers use.
    const response = await handler!({ request: new Request("https://patron.example/blog/rss") });
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await response.text();
    expect(xml).toContain("<rss version=\"2.0\">");
    expect(xml).toContain("<channel>");
    for (const post of blogPosts) {
      expect(xml).toContain(post.title);
      expect(xml).toContain(`/blog/${post.slug}`);
    }
    expect(xml).not.toMatch(/[—–]/);
  });
});
