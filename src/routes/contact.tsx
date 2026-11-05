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
      { title: "Talk to us | Patron" },
      {
        name: "description",
        content:
          "Talk to us about your restaurant, your regulars and your quiet days. Five short steps, then a real person replies within one working day.",
      },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { kind, quietDay } = Route.useSearch();
  return (
    <MarketingShell back={{ to: "/", label: "Back" }}>
      <section className="marketing-page-hero page-width">
        <span className="eyebrow">
          <span className="eyebrow-line" /> Contact
        </span>
        <h1>
          Talk to <span className="editorial">us.</span>
        </h1>
        <p>
          Five short steps about your place, your regulars and your quiet days. A real person
          replies within one working day, and nothing is signed on the day.
        </p>
      </section>
      <LeadForm initialKind={kind ?? "owner"} initialQuietDay={quietDay} />
    </MarketingShell>
  );
}
