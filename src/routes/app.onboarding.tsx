import { createFileRoute, redirect } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { ONBOARDING_STEPS, getChecklist, toggleStep } from "@/domain/onboarding";
import { PageHeader, StatCard, StatGrid } from "@/components/patron/dash";

export const Route = createFileRoute("/app/onboarding")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Onboarding,
});

function Onboarding() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const found = getChecklist(restaurant.id);
  const checklist = found.ok ? found.data : { done: {} };
  const doneCount = ONBOARDING_STEPS.filter(
    (step) => (checklist.done as Record<string, string>)[step.id],
  ).length;
  const leftCount = ONBOARDING_STEPS.length - doneCount;
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · Onboarding`}
        title={`Get ${restaurant.name} live`}
        intro="Tick each step as you finish it. You can come back to this page at any time."
      />
      <StatGrid>
        <StatCard value={doneCount} label="Steps done" />
        <StatCard value={leftCount} label="Steps left" />
      </StatGrid>
      <section className="builder-panel">
        <h2>Your checklist</h2>
        {ONBOARDING_STEPS.map((step) => {
          const done = !!(checklist.done as Record<string, string>)[step.id];
          return (
            <label className="guest-consent" key={step.id}>
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggleStep(restaurant.id, step.id)}
              />
              <span>{step.label}</span>
            </label>
          );
        })}
      </section>
      <p>
        <a href="/">Back to Patron</a>
      </p>
    </main>
  );
}
