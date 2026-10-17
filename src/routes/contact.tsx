import { createFileRoute } from "@tanstack/react-router";
import { LeadForm } from "@/components/patron/LeadForm";

export const Route = createFileRoute("/contact")({
  component: Contact,
});

function Contact() {
  return (
    <main className="demo-hub page-width">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Contact
      </p>
      <h1>Book a demo visit.</h1>
      <p className="demo-intro">Fifteen minutes at your counter — we bring the QR pack.</p>
      <LeadForm />
      <p>
        <a href="/">Home</a>
      </p>
    </main>
  );
}
