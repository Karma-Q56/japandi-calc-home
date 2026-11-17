import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { APP_NAME } from "@/config/app";
import { formatRand } from "@/lib/money";
import { useDemoState } from "@/data/useDemoState";
import { Badge, DataTable, PageHeader } from "@/components/patron/dash";
import type { Restaurant } from "@/data/types";
import { getDataModeFn } from "@/server/live";
import { listRestaurantsFn } from "@/server/live-ops-restaurants-fns";
import { LiveOpsRestaurants } from "@/components/patron/live/ops/LiveOpsRestaurants";

const RestaurantsPage = withChildren(RestaurantList);

export const Route = createFileRoute("/ops/restaurants")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("operator")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await listRestaurantsFn({ data: { search: "", status: "", limit: 50, offset: 0 } }) };
  },
  component: LiveOrDemoRestaurants,
});

function LiveOrDemoRestaurants() {
  const { mode, live } = Route.useLoaderData();
  if (mode === "live" && live) return <LiveOpsRestaurants initial={live} />;
  return <RestaurantsPage />;
}

type Row = {
  restaurant: Restaurant;
  members: number;
  lastStamp: string | undefined;
};

const dateLabel = (iso: string | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(iso))
    : "not set";

function RestaurantList() {
  const state = useDemoState();
  const rows: Row[] = state.restaurants.map((restaurant) => {
    const members = state.memberships.filter(
      (item) => item.restaurantId === restaurant.id,
    ).length;
    const latest = state.stamps
      .filter((item) => item.restaurantId === restaurant.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { restaurant, members, lastStamp: latest?.createdAt };
  });

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Operator workspace"
        title="Restaurants"
        intro="A demo view of each venue's plan, guests, recent activity and credit balance."
        actions={
          <a className="builder-primary" href="/ops/restaurants/new">
            Add a restaurant
          </a>
        }
      />
      <DataTable
        caption="All restaurants with plan, guests, recent activity and credit balance"
        rows={rows}
        columns={[
          {
            key: "restaurant",
            header: "Restaurant",
            cell: (row) => (
              <a href={`/ops/restaurants/${row.restaurant.id}`}>
                <strong>{row.restaurant.name}</strong>
                <small>/{row.restaurant.slug}</small>
              </a>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (row) => (
              <Badge {...(row.restaurant.status === "active" ? { tone: "active" as const } : {})}>
                {row.restaurant.status}
              </Badge>
            ),
          },
          { key: "plan", header: "Plan", cell: (row) => row.restaurant.plan },
          { key: "members", header: "Members", cell: (row) => row.members },
          { key: "lastStamp", header: "Last stamp", cell: (row) => dateLabel(row.lastStamp) },
          {
            key: "credit",
            header: "SMS credit",
            cell: (row) => formatRand(row.restaurant.creditCents),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (row) => (
              <span className="row-actions">
                <a
                  className="row-action is-primary"
                  href={`/ops/restaurants/${row.restaurant.id}/look`}
                >
                  Look and feel
                </a>
                <a className="row-action" href={`/r/${row.restaurant.slug}`}>
                  View page
                </a>
                <a className="row-action" href={`/ops/restaurants/${row.restaurant.id}/qr`}>
                  QR
                </a>
              </span>
            ),
          },
        ]}
      />
      <p className="demo-data-note">
        All records are Demo data. This operator preview belongs to {APP_NAME}.
      </p>
    </main>
  );
}
