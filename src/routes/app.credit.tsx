import { createFileRoute, redirect } from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { DemoPlaceholder } from "@/components/patron/DemoPlaceholder";

export const Route = createFileRoute("/app/credit")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
    }
  },
  component: () => (
    <DemoPlaceholder title="Credit" description="Top-ups and SMS cost settlement arrive in M6." />
  ),
});
