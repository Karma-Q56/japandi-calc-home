import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { QuietDay } from "@/components/patron/QuietDay";
import { Planner } from "@/components/patron/Planner";
import { commercial, plans, rand } from "@/lib/patron";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing: plans for your kind of place | Patron" },
      {
        name: "description",
        content:
          "Month-to-month plans for independent restaurants: Starter, Growth and Pro, with a once-off setup and prepaid SMS credits.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  return (
    <MarketingShell>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Pricing · Proposed
        </span>
        <h1>
          Plans for your kind of <span className="editorial">place.</span>
        </h1>
        <p>
          Month to month, no long contracts. Start with the card and the list, or hand the campaigns
          to us. Every plan includes your page, your QR pack and staff training.
        </p>
      </section>

      <section className="section page-width">
        <div className="pricing-grid">
          {plans.map((plan, index) => (
            <article className={`price-card ${index === 1 ? "featured" : ""}`} key={plan.name}>
              {index === 1 && <span className="price-tag">An extra pair of hands</span>}
              <h2>{plan.name}</h2>
              <p className="price-description">{plan.description}</p>
              <div className="price-amount">
                {rand(plan.min)}–{rand(plan.max)}
              </div>
              <span className="price-period">per month · proposed pricing</span>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="pricing-table-wrap">
          <h2 className="pricing-table-heading">What each plan includes</h2>
          <table className="pricing-table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                {plans.map((plan) => (
                  <th scope="col" key={plan.name}>
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Digital stamp card, QR and page", true, true, true],
                ["Guest list and results", true, true, true],
                ["SMS offers you send yourself", true, true, true],
                ["Campaigns done for you", "Not included", "4 a month", "Weekly"],
                ["Birthday offers", "Not included", "Not included", true],
                ["Monthly results report", "Not included", true, true],
                ["Support", "Email", "Email and WhatsApp", "Priority, hands-on"],
                ["Staff training", true, true, true],
              ].map(([label, ...values]) => (
                <tr key={String(label)}>
                  <th scope="row">{label}</th>
                  {values.map((value, index) => (
                    <td key={`${String(label)}-${index}`}>
                      {value === true ? (
                        <>
                          <Check aria-hidden="true" /> <span className="sr-only">Included</span>
                        </>
                      ) : (
                        String(value)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pricing-notes">
          <p>
            Once-off setup: {rand(commercial.setupMin)}–{rand(commercial.setupMax)}. Includes your
            page, QR cards, staff training and your first campaign.
          </p>
          <p>
            SMS credits are prepaid and separate, estimated at R{commercial.smsEstimate.toFixed(2)}{" "}
            per message. You see the cost before sending, so there are no surprise SMS bills.
          </p>
          <p>
            Founding partners, our first {commercial.foundingSpots} restaurants, receive a reduced
            setup fee and a discounted monthly plan for {commercial.discountMonths} months.
          </p>
        </div>
        <div className="page-cta-row">
          <a className="builder-primary" href="/contact">
            Talk to us <ArrowRight size={16} />
          </a>
          <a className="text-link" href="/how-it-works">
            How it works
          </a>
          <a className="text-link" href="/blog">
            Notes on loyalty
          </a>
        </div>
      </section>

      <QuietDay />
      <Planner />
    </MarketingShell>
  );
}
