import { createFileRoute, redirect } from "@tanstack/react-router";
import { withChildren } from "@/lib/nested";

/**
 * The public demo hub is gone: /demo redirects home and this file only exists as the
 * parent for the developer pages under /demo (status and outbox). Role switching lives
 * at the unlinked /dev/roles route.
 */
export const Route = createFileRoute("/demo")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/demo") {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: withChildren(DemoIndex),
});

function DemoIndex() {
  return null;
}
