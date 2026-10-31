import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { LeadForm } from "@/components/patron/LeadForm";
import type { LeadKind } from "@/data/types";

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>): {
    kind?: LeadKind | undefined;
    quietDay?: string | undefined;
  } => ({
    kind:
      search["kind"] === "diner" || search["kind"] === "other" || search["kind"] === "owner"
        ? search["kind"]
        : undefined,
    quietDay:
      typeof search["quietDay"] === "string" &&
      [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ].includes(search["quietDay"])
        ? search["quietDay"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Book a visit | Patron" },
      {
        name: "description",
        content:
          "Book a 15-minute visit at your restaurant to talk about your regulars, your slow days and how Patron could help.",
      },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { kind, quietDay } = Route.useSearch();
  return (
    <MarketingShell>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Contact
        </span>
        <h1>
          Book a <span className="editorial">15-minute visit.</span>
        </h1>
        <p>
          Fifteen minutes at your counter, we bring the QR pack and answer the awkward questions.
          No slides, no pressure, and no obligation to sign anything on the day.
        </p>
      </section>
      <LeadForm initialKind={kind ?? "owner"} initialQuietDay={quietDay} />
    </MarketingShell>
  );
}
