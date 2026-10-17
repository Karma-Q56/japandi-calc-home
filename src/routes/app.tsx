import { withChildren } from "@/lib/nested";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { DemoPlaceholder } from "@/components/patron/DemoPlaceholder";

const OwnerPage = withChildren(() => (
  <DemoPlaceholder
    title="Owner dashboard"
    description="The owner workspace will be built from the shared demo data in the next milestones."
  />
));
export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (!requireRole("owner")(demoRepo.read().session)) throw redirect({ to: "/demo" });
  },
  component: OwnerPage,
});
