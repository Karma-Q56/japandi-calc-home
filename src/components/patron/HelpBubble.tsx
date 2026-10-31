import { useEffect, useState } from "react";
import { HelpCircle, Mail, MessageCircle, X } from "lucide-react";
import { siteDetails } from "@/config/site-details";
import { whatsappLink } from "@/lib/patron";

const QUESTIONS = [
  {
    question: "Do my guests need an app?",
    answer:
      "No. Their card opens in the phone's browser after they scan your QR code. They join with a name and phone number.",
  },
  {
    question: "What does it cost?",
    answer:
      "Plans start at R299 a month, with SMS credit sold separately at about R0.35 a message. The pricing page has the full list and a monthly estimate.",
  },
  {
    question: "Can a guest stop messages?",
    answer:
      "Yes. Every SMS has STOP, which stops that restaurant's marketing. STOPALL stops every restaurant. Guests can also switch a restaurant off under Me, then Messages.",
  },
];

export function HelpBubble() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="help-bubble">
      {open && (
        <section className="help-panel" role="dialog" aria-label="Quick help" aria-modal="false">
          <div className="help-panel-head">
            <h2>Quick help</h2>
            <button className="help-close" aria-label="Close help" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="help-questions">
            {QUESTIONS.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <p className="demo-data-note">Still stuck? A real person answers {siteDetails.supportHours}.</p>
          <div className="help-actions">
            <a
              className="builder-primary"
              href={whatsappLink("Hi Patron! I have a question.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
            <a className="builder-secondary" href={`mailto:${siteDetails.supportEmail}`}>
              <Mail size={16} /> Email
            </a>
          </div>
          <p className="help-placeholder">
            Placeholder contacts in this preview: {siteDetails.supportEmail} · {siteDetails.phone}
          </p>
        </section>
      )}
      <button
        className="help-toggle"
        aria-expanded={open}
        aria-label={open ? "Close quick help" : "Open quick help"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={20} /> : <HelpCircle size={20} />}
        <span>{open ? "Close" : "Help"}</span>
      </button>
    </div>
  );
}
