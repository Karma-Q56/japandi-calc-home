import { QueryClient } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
  type AnyRoute,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { demoRepo, updateDemo } from "@/data/repo";

vi.mock("@/server/live", () => ({
  getDataModeFn: async () => ({ mode: "demo" }),
  getPublicPageFn: async () => ({ page: null }),
  getCardFn: async () => ({ card: null }),
  joinGuestFn: async () => ({ ok: false, message: "Demo mode" }),
  recordStampFn: async () => ({ ok: true }),
  verifyScanFn: async () => ({ ok: true }),
}));

/**
 * Walks every leaf route in the generated tree and renders it once. Each
 * page must show exactly one header (utility pages without a shell are
 * allowlisted), must not render an em dash anywhere, and must not log
 * console errors.
 */
type Leaf = { segments: string[] };
function leafRoutes(route: AnyRoute, segments: string[] = [], out: Leaf[] = []): Leaf[] {
  const path = (route.options as { path?: string }).path ?? "";
  const here = path && path !== "/" ? [...segments, path] : segments;
  const children = (route.children ?? []) as AnyRoute[];
  if (children.length === 0 && route !== (routeTree as AnyRoute)) out.push({ segments: here });
  for (const child of children) leafRoutes(child, here, out);
  return out;
}

// Server health endpoints are not pages.
// /r/<slug>/logo serves a PNG image, not a page.
const NON_PAGES = ["/api", "/healthz", "/blog/rss", "/r/$slug/logo"];

const NO_HEADER_OK = [
  "/consent-wording",
  "/demo/outbox",
  "/link-expired",
  "/maintenance",
  "/offline",
  "/session-expired",
  "/stamp",
  "/dev/roles",
  "/demo/status",
];

function roleFor(path: string): "guest" | "owner" | "manager" | "operator" | "staff" | null {
  if (path.startsWith("/app")) return "owner";
  if (path.startsWith("/ops")) return "operator";
  if (path.startsWith("/me")) return "guest";
  if (path.startsWith("/stamp")) return "staff";
  return null;
}

function fillParams(path: string): string {
  const state = demoRepo.read();
  const restaurant = state.restaurants[0]!;
  const campaign = state.campaigns.find((c) => c.restaurantId === restaurant.id);
  const membership = state.memberships.find((m) => m.restaurantId === restaurant.id);
  if (path.startsWith("/blog/$")) {
    // The blog slug namespace is its own: use a real note, not a venue slug.
    return path.replace("$slug", "why-the-card-still-works");
  }
  if (path.startsWith("/app/customers/") && membership) {
    return path.replace("$id", membership.customerId);
  }
  if (path.startsWith("/app/campaigns/") && campaign) {
    return path.replace("$campaignId", campaign.id);
  }
  return path
    .replace("$slug", restaurant.slug)
    .replace("$id", restaurant.id)
    .replace("$campaignId", campaign?.id ?? "x");
}

beforeEach(() => {
  demoRepo.reset();
});

afterEach(() => {
  cleanup();
});

describe("routes audit", () => {
  const leaves = leafRoutes(routeTree as AnyRoute);
  it("discovers a sensible number of routes", () => {
    expect(leaves.length).toBeGreaterThan(20);
  });

  for (const leaf of leaves) {
    const template =
      "/" +
      leaf.segments
        .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
        .filter(Boolean)
        .join("/");
    if (NON_PAGES.some((base) => template === base || template.startsWith(base + "/"))) {
      continue; // webhook endpoints and health checks, not pages
    }
    if (template === "/u/$token") continue; // needs a real invitation token; covered by the browser walk
    const url = fillParams(template);
    it(`${url} renders one header, no console errors and no em dash`, async () => {
      const role = roleFor(template);
      if (role === "owner") {
        updateDemo((state) => ({
          ...state,
          session: { role: "owner", restaurantId: state.restaurants[0]!.id },
        }));
      } else if (role) {
        updateDemo((state) => ({ ...state, session: { role } }));
      }

      // React testing-library renders the root document inside a div, which
      // logs two warnings a real browser does not show (the real Chrome walk
      // over the same routes reports none). Ignore those two artifacts and
      // everything "not wrapped in act"; keep all other errors.
      const artifacts = [
        "An empty string",
        "cannot be a child of",
        "not wrapped in act",
      ];
      const errors: string[] = [];
      const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        const text = args.map((a) => String(a)).join(" ");
        if (!artifacts.some((artifact) => text.includes(artifact))) errors.push(text.slice(0, 300));
        return undefined as never;
      });

      const queryClient = new QueryClient();
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: [url] }),
        context: { queryClient },
      });
      await router.load();
      render(<RouterProvider router={router} />);
      await waitFor(
        () => {
          expect(document.body.textContent).not.toBe("");
        },
        { timeout: 3000 },
      );
      // Let effects settle so late console errors are captured too.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const finalUrl = router.state.location.pathname;
      const headers = document.querySelectorAll("header").length;
      if (!NO_HEADER_OK.some((base) => finalUrl === base || finalUrl.startsWith(base + "/"))) {
        expect(headers, `${url} landed on ${finalUrl}`).toBe(1);
      } else {
        expect(headers, `${url} landed on ${finalUrl}`).toBeLessThanOrEqual(1);
      }
      expect(document.body.textContent, `${url} contains an em dash`).not.toContain("\u2014");
      expect(errors, `${url} logged console errors: ${errors.join(" | ")}`).toEqual([]);
      errorSpy.mockRestore();
    });
  }
});
