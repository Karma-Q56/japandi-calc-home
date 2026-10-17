import { createFileRoute } from "@tanstack/react-router";
import { commercial, plans, rand } from "@/lib/patron";

export const Route = createFileRoute("/pricing")({
  component: Pricing,
});

function Pricing() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Pricing · Proposed
      </p>
      <h1>Plans for your kind of place.</h1>
      <div className="pricing-grid">
        {plans.map((plan) => (
          <article className="price-card" key={plan.name}>
            <h2>{plan.name}</h2>
            <p className="price-description">{plan.description}</p>
            <div className="price-amount">
              {rand(plan.min)}–{rand(plan.max)}
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="demo-data-note">
        Setup {rand(commercial.setupMin)}–{rand(commercial.setupMax)} · Founding partners:{" "}
        {commercial.foundingSpots} spots.
      </p>
      <p>
        <a href="/contact">Book a demo</a> · <a href="/">Home</a>
      </p>
    </main>
  );
}
