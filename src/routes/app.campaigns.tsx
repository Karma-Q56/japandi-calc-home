import { createFileRoute, redirect } from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { DemoPlaceholder } from "@/components/patron/DemoPlaceholder";

export const Route = createFileRoute("/app/campaigns")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
  },
  component: () => (
    <DemoPlaceholder
      title="Campaigns"
      description="The composer with preview and cost estimate arrives in M7."
    />
  ),
});
