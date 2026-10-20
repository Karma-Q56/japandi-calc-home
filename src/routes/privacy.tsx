import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
});

function Privacy() {
  return (
    <main className="demo-hub page-width legal-page">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Legal · Draft
      </p>
      <h1>Privacy notice.</h1>
      <p className="demo-intro">
        Draft wording for the demo — needs lawyer review before any pilot.
      </p>
      <section className="builder-panel">
        <h2>What we collect</h2>
        <p>
          Your first name, mobile number, the restaurants you join, stamps, rewards, offers,
          spins, challenge progress and tier. A birthday is optional and only used for a birthday
          bonus where the restaurant offers one. The demo stores all of this in your browser only.
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
        <h2>Your data</h2>
        <p>
          You can download your data and request deletion from Me. Deleting removes your name and
          number while keeping anonymous activity counts where needed for accounting. No real
          personal data leaves this device in the demo preview.
        </p>
        <h2>Third parties</h2>
        <p>
          The live build sends SMS through a provider, which receives the destination number and
          message body. Patron never sells guest lists. Restaurants only see their own guests.
        </p>
      </section>
      <p>
        <a href="/terms">Terms of use</a> · <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
