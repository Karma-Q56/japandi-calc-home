import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/patron";
import { api } from "@/api";
import { getDataModeFn, submitLeadFn } from "@/server/live";
import type { LeadKind } from "@/data/types";

type Status = "idle" | "loading" | "success" | "error";

const MAX_MESSAGE = 1000;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const KINDS: { value: LeadKind; label: string; hint: string }[] = [
  { value: "owner", label: "I own or manage a place", hint: "Ask about Patron for your restaurant." },
  { value: "diner", label: "I eat out", hint: "Ask for a favourite place to join Patron." },
  { value: "other", label: "Something else", hint: "Suppliers, partners or a general question." },
];

export function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [kind, setKind] = useState<LeadKind>("owner");
  const [live, setLive] = useState(false);
  const [reference, setReference] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let on = true;
    getDataModeFn()
      .then((r) => {
        if (on && r.mode === "live") setLive(true);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const get = (key: string) => String(data.get(key) ?? "").trim();
    if (get("website")) {
      setStatus("success");
      return;
    }
    setStatus("loading");
    setError("");
    const contactName = get("contact_name") || (kind === "diner" ? "Diner" : "");
    setName(contactName);
    const quietDay = get("quiet_day");
    const quietPart = get("quiet_part");
    const quietTime = [quietDay, quietPart].filter(Boolean).join(", ");
    const common = {
      kind,
      restaurantName:
        get("restaurant_name") || (kind === "diner" ? get("wanted_place") : get("subject")),
      contactName,
      phone: get("phone"),
      email: get("email") || undefined,
      suburb: get("area") || undefined,
      consent: data.get("consent") === "on",
    };

    if (!live) {
      const saved = api.enquiries.submit({
        ...common,
        role: get("role") || undefined,
        venueType: get("restaurant_type") || undefined,
        quietTime: quietTime || undefined,
        weeklyGuests: get("weekly_guests") || undefined,
        planInterest: get("plan_interest") || undefined,
        visitWanted: kind === "owner" ? get("visit_wanted") === "yes" : undefined,
        preferredDay: get("preferred_day") || undefined,
        message: get("message") || undefined,
      });
      if (!saved.ok) {
        setError(saved.error.message);
        setStatus("error");
        return;
      }
      setReference(saved.data.reference);
      setStatus("success");
      return;
    }

    const result = await submitLeadFn({
      data: {
        ...common,
        role: get("role") || undefined,
        venueType: get("restaurant_type") || undefined,
        quietTime: quietTime || undefined,
        weeklyGuests: get("weekly_guests") || undefined,
        planInterest: get("plan_interest") || undefined,
        visitWanted: kind === "owner" ? get("visit_wanted") === "yes" : undefined,
        preferredDay: get("preferred_day") || undefined,
        notes: get("message") || undefined,
        consentVersion: "v2",
        website: get("website") || undefined,
      },
    });
    if (!result.ok) {
      setError(result.message);
      setStatus("error");
      return;
    }
    setReference(result.reference ?? "");
    setStatus("success");
  };

  return (
    <section className="founding-section form-section" id="visit">
      <div className="page-width form-inner">
        <div className="founding-copy" data-reveal>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            {kind === "diner" ? "Ask for a place" : "Book a 15-minute visit"}
          </div>
          <h2 className="section-heading">
            Let’s make you a
            <br />
            <span className="editorial">neighbourhood favourite.</span>
          </h2>
          <p>
            {kind === "diner"
              ? "Tell us which place deserves a loyalty card. We count every ask and talk to the places guests mention most."
              : "Tell us a little about your place. We’ll pop round for 15 minutes to chat about your regulars and your slow days."}
          </p>
        </div>
        <div className="lead-card">
          {status === "success" ? (
            <div className="lead-success" role="status">
              <Check />
              <h3>Thanks{name && name !== "Diner" ? `, ${name}` : ""}.</h3>
              {reference ? (
                <p>
                  Your reference is <strong>{reference}</strong>. Keep it if you need to follow up.
                </p>
              ) : (
                <p>We have your enquiry.</p>
              )}
              <p>
                {kind === "diner"
                  ? "We add places when enough guests ask. Your ask is counted, and we will contact the restaurant, not you."
                  : "A real person replies within one working day. If you asked for a visit, we will confirm the day before."}
              </p>
              <p className="demo-data-note">Demo mode: nothing left this browser and no email was sent.</p>
              <Button variant="quiet" asChild>
                <a
                  href={whatsappLink("Hi Patron! I’d like to talk about my restaurant.")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle /> Open WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="lead-form">
              <fieldset className="lead-kinds">
                <legend>I am a…</legend>
                <div className="lead-kind-options">
                  {KINDS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`lead-kind${kind === option.value ? " is-active" : ""}`}
                      aria-pressed={kind === option.value}
                      onClick={() => {
                        setKind(option.value);
                        setStatus("idle");
                        setError("");
                      }}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </button>
                  ))}
                </div>
              </fieldset>

              {kind === "owner" && (
                <>
                  <label>
                    Restaurant name
                    <input name="restaurant_name" required maxLength={200} autoComplete="organization" />
                  </label>
                  <div className="lead-pair">
                    <label>
                      Your name
                      <input name="contact_name" required maxLength={120} autoComplete="name" />
                    </label>
                    <label>
                      Your role
                      <select name="role" defaultValue="Owner" required>
                        <option>Owner</option>
                        <option>Manager</option>
                        <option>Staff</option>
                        <option>Something else</option>
                      </select>
                    </label>
                  </div>
                  <div className="lead-pair">
                    <label>
                      Phone or WhatsApp
                      <input
                        name="phone"
                        required
                        type="tel"
                        maxLength={30}
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+27 82 123 4567"
                      />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" maxLength={254} autoComplete="email" placeholder="you@example.co.za" />
                    </label>
                  </div>
                  <div className="lead-pair">
                    <label>
                      Type of place
                      <select name="restaurant_type" defaultValue="Cafe" required>
                        <option>Cafe</option>
                        <option>Bakery</option>
                        <option>Restaurant</option>
                        <option>Takeaway</option>
                        <option>Something else</option>
                      </select>
                    </label>
                    <label>
                      Suburb
                      <input name="area" required maxLength={120} placeholder="Parkhurst" />
                    </label>
                  </div>
                  <div className="lead-pair">
                    <label>
                      Quietest day
                      <select name="quiet_day" defaultValue="Tuesday">
                        {DAYS.map((day) => (
                          <option key={day}>{day}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quietest time
                      <input name="quiet_part" maxLength={60} placeholder="Morning, lunch or evening" />
                    </label>
                  </div>
                  <div className="lead-pair">
                    <label>
                      Guests a week
                      <input name="weekly_guests" type="number" min={0} max={100000} placeholder="250" />
                    </label>
                    <label>
                      Which plan interests you?
                      <select name="plan_interest" defaultValue="Not sure yet">
                        <option>Starter</option>
                        <option>Growth</option>
                        <option>Pro</option>
                        <option>Not sure yet</option>
                      </select>
                    </label>
                  </div>
                  <fieldset className="lead-visit">
                    <legend>Would you like a 15-minute visit?</legend>
                    <label>
                      <input type="radio" name="visit_wanted" value="yes" defaultChecked /> Yes, please
                    </label>
                    <label>
                      <input type="radio" name="visit_wanted" value="no" /> Not yet
                    </label>
                  </fieldset>
                  <label>
                    Preferred day for a visit
                    <select name="preferred_day" defaultValue="">
                      <option value="">Any day that suits you</option>
                      {DAYS.map((day) => (
                        <option key={day}>{day}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {kind === "diner" && (
                <>
                  <label>
                    Which place would you like on Patron?
                    <input
                      name="wanted_place"
                      required
                      maxLength={200}
                      placeholder="The name of the cafe, bakery or restaurant"
                    />
                  </label>
                  <label>
                    Suburb
                    <input name="area" required maxLength={120} placeholder="Melville" />
                  </label>
                </>
              )}

              {kind === "other" && (
                <>
                  <label>
                    Your name
                    <input name="contact_name" required maxLength={120} autoComplete="name" />
                  </label>
                  <label>
                    What is this about?
                    <input name="subject" required maxLength={200} placeholder="A short subject" />
                  </label>
                  <div className="lead-pair">
                    <label>
                      Phone
                      <input name="phone" type="tel" maxLength={30} autoComplete="tel" inputMode="tel" />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" maxLength={254} autoComplete="email" />
                    </label>
                  </div>
                </>
              )}

              <label>
                Message
                <textarea
                  name="message"
                  rows={4}
                  maxLength={MAX_MESSAGE}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={kind === "diner" ? "Optional. Tell us why this place is worth it." : "What would you like help with?"}
                />
                <small className="lead-counter">
                  {message.length} of {MAX_MESSAGE} characters
                </small>
              </label>

              <div className="honeypot" aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <label className="lead-consent">
                <input type="checkbox" name="consent" required />
                {kind === "diner"
                  ? "I agree Patron may use this answer to decide where to launch next. No marketing messages."
                  : "I agree Patron may contact me on WhatsApp, by phone or email about this enquiry. Consent is recorded with the time."}
              </label>

              <Button variant="patron" className="primary-cta" type="submit" disabled={status === "loading"}>
                {status === "loading" ? (
                  <>
                    <Loader2 className="animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    {kind === "diner" ? "Send my ask" : "Book my visit"} <ArrowUpRight />
                  </>
                )}
              </Button>
              {error && (
                <div className="lead-error" role="alert">
                  <p>{error}</p>
                  <Button variant="quiet" asChild>
                    <a
                      href={whatsappLink("Hi Patron! I’d like to talk about my restaurant.")}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle /> Open WhatsApp instead
                    </a>
                  </Button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
