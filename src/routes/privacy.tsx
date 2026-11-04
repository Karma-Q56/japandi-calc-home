import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
});

function Privacy() {
  return (
    <MarketingShell back={{ to: "/", label: "Back" }}>
      <section className="marketing-page-hero page-width">
        <p className="eyebrow">
          <span className="eyebrow-line" />
          Legal · Draft
        </p>
        <h1>Privacy notice.</h1>
        <p>Draft wording for the demo, needs lawyer review before any pilot.</p>
      </section>
      <section className="section page-width legal-page">
        <h2>What we collect</h2>
        <p>
          Your first name, mobile number, the restaurants you join, stamps, rewards, offers,
          spins, challenge progress and tier. The demo stores all of this in your browser only.
        </p>
        <h2>Your birthday, visits and orders</h2>
        <p>
          Three optional extras help a restaurant look after you. Your birthday, stored as a day
          and month only, never a year, so the restaurant can spoil you with a birthday bonus if
          it offers one. The timing of your visits, worked out from the stamps on your card, so
          the restaurant can spot favourite days and quiet hours. What you ordered, if the
          till adds it, so the restaurant can learn its most loved dishes.
        </p>
        <p>
          Only the restaurant you joined can see these three. No other venue on Patron sees
          them, and Patron does not sell them. Your birthday is never shared with anyone else.
        </p>
        <h2>Loyalty and campaign consent</h2>
        <p>
          Consent is recorded per restaurant, with the exact wording and version you agreed to.
          Joining a restaurant&apos;s card includes consent to its loyalty offers by SMS. You can
          change your choice for each restaurant under Me → Messages. Turning one off does not
          affect the others or your card.
        </p>
        <h2>Messages</h2>
        <p>
          Reply STOP to opt out of the restaurant that last messaged you, or STOPALL to opt out of
          every Patron venue. Every message includes a STOP line. We keep an opt-out record so a
          venue cannot message you again without a new choice from you.
        </p>
        <h2>Feedback you send</h2>
        <p>
          You can send a note from the feedback page or from your diner settings. We keep the
          category, your message, any contact detail you choose to leave and the date. Notes are
          kept for twelve months, then removed. A picture, if you attach one, is visible only to
          the Patron team and to you. We do not use your feedback for marketing.
        </p>
        <h2>Your data</h2>
        <p>
          You can download your data and request deletion from Me. The download includes your
          birthday, visit patterns and orders for each restaurant. Deleting removes your name,
          number, birthday and orders, while keeping anonymous activity counts where needed for
          accounting. No real personal data leaves this device in the demo preview.
        </p>
        <h2>Asking for a place</h2>
        <p>
          On the ask for a place page you may send us the name of a cafe, bakery or restaurant
          you want on Patron. That page keeps only the place name, the suburb and an optional
          note. It does not ask for a phone number or an email, so the ask cannot be used to
          contact you. A first name is optional and never published, and we contact the
          restaurant, not the guest.
        </p>
        <h2>Third parties</h2>
        <p>
          The live build sends SMS through a messaging service, which receives the destination number and
          message body. Patron never sells guest lists. Restaurants only see their own guests.
        </p>
      </section>
      <p className="legal-more">
        <a href="/terms">Terms of use</a> · <a href="/contact">Contact us</a>
      </p>
    </MarketingShell>
  );
}
