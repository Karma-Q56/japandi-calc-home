import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/case-studies")({
  component: CaseStudies,
});

function CaseStudies() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Case studies
      </p>
      <h1>Neighbourhood results.</h1>
      <p className="demo-intro">
        Placeholder — pilot stories land here after the first three founding restaurants.
      </p>
      <p>
        <a href="/contact">Become a founding partner</a>
      </p>
    </main>
  );
}
