import { markOutletComponent } from "@/lib/nested";
import {
  createFileRoute,
  redirect,
  Link,
  Outlet,
  useChildMatches,
  useRouterState,
} from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { canOpenArea } from "@/lib/auth-rules";
import { getDataModeFn, getViewerFn } from "@/server/live";
import { APP_NAME } from "@/config/app";
import { DemoPlaceholder } from "@/components/patron/DemoPlaceholder";
import { signOut } from "@/lib/sign-out";

const LINKS = [
  { to: "/ops/restaurants", label: "Restaurants" },
  { to: "/ops/leads", label: "Enquiries" },
  { to: "/ops/campaigns", label: "Campaigns" },
  { to: "/ops/credit", label: "Credit" },
  { to: "/ops/outbox", label: "SMS outbox" },
  { to: "/ops/feedback", label: "Feedback" },
] as const;

function OpsShell() {
  const { mode } = Route.useLoaderData();
  const children = useChildMatches();
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="opsx">
      <header className="opsx-bar">
        <Link to="/ops/restaurants" className="opsx-brand">
          {APP_NAME.toLowerCase()}
          <span>.</span> <small>operator</small>
        </Link>
        <nav aria-label="Operator sections">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={path.startsWith(link.to) ? "is-active" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="opsx-logout"
          data-testid="operator-logout"
          onClick={() => void signOut(mode)}
        >
          Log out
        </button>
      </header>
      {children.length > 0 ? (
        <Outlet />
      ) : (
        <DemoPlaceholder
          title="Operator console"
          description="Pick a section above to set up restaurants, look and feel, credit and campaigns."
        />
      )}
    </div>
  );
}

const OpsPage = markOutletComponent(OpsShell);
export const Route = createFileRoute("/ops")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") {
      const viewer = await getViewerFn();
      if (!viewer || !canOpenArea(viewer.role, "ops")) {
        throw redirect({ to: "/login" });
      }
      return;
    }
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => getDataModeFn(),
  component: OpsPage,
});
