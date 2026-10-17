import { createFileRoute, redirect } from "@tanstack/react-router";
import { useDemoState } from "@/data/useDemoState";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { ONBOARDING_STEPS, getChecklist, toggleStep } from "@/domain/onboarding";

export const Route = createFileRoute("/app/onboarding")({
  beforeLoad: () => {
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/demo" });
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
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Onboarding · {restaurant.name}
      </p>
      <h1>Get {restaurant.name} live.</h1>
      <p className="demo-intro">
        {doneCount} of {ONBOARDING_STEPS.length} steps done.
      </p>
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
      <p>
        <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
