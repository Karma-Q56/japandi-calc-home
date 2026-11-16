import { createFileRoute, redirect } from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { BranchesView } from "@/components/patron/BranchesView";
import { getDataModeFn } from "@/server/live";
import { getBranchesFn } from "@/server/live-locations-fns";

export const Route = createFileRoute("/app/locations")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return { mode, live: await getBranchesFn() };
  },
  component: Locations,
});

function Locations() {
  const data = Route.useLoaderData();
  return <BranchesView live={data.mode === "live"} initial={data.live} />;
}
