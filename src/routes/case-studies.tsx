import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { commercial } from "@/lib/patron";

export const Route = createFileRoute("/case-studies")({
  head: () => ({
    meta: [
      { title: "Case studies: neighbourhood results | Patron" },
      {
        name: "description",
        content:
          "Pilot stories from the first independent South African restaurants using Patron: what we measure and what we will publish.",
      },
    ],
  }),
  component: CaseStudies,
});

function CaseStudies() {
  return (
    <MarketingShell>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Case studies
        </span>
        <h1>
          Neighbourhood <span className="editorial">results.</span>
        </h1>
        <p>
          We are working with our first {commercial.foundingSpots} founding restaurants in
          Johannesburg. This page stays honest: it fills up once those restaurants have a few months
          of real numbers behind them.
        </p>
      </section>

      <section className="section page-width">
        <div className="case-placeholder">
          <h2>Nothing invented.</h2>
          <p>
            There are no pilot results to show yet. When there are, each story will show the
            restaurant in its own words, the numbers behind it and the period they cover, approved
            by the owner before it goes up.
          </p>
        </div>
        <ul className="case-measures">
          <li>
            <strong>Return visits</strong>
            <span>How many guests come back a second and third time, and how quickly.</span>
          </li>
          <li>
            <strong>Quiet-day covers</strong>
            <span>Whether a weekday special actually shifts covers on that day.</span>
          </li>
          <li>
            <strong>Campaign response</strong>
            <span>How many opted-in guests redeemed a code, against what the send cost.</span>
          </li>
        </ul>
        <div className="page-cta-row">
          <a className="builder-primary" href="/contact">
            Become a founding partner <ArrowRight size={16} />
          </a>
          <a className="text-link" href="/pricing">
            See the plans
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}
