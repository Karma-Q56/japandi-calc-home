import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: Terms,
});

function Terms() {
  return (
    <main className="demo-hub page-width legal-page">
      <p className="eyebrow">
        <span className="eyebrow-line" />
        Legal · Draft
      </p>
      <h1>Terms of use.</h1>
      <p className="demo-intro">
        Draft wording for the demo — needs lawyer review before any pilot.
      </p>
      <section className="builder-panel">
        <h2>Loyalty cards</h2>
        <p>
          A loyalty card is offered by the restaurant you join, not by Patron. Each restaurant sets
          its own stamp target, reward and visit rules. Stamps are only added by restaurant staff
          after a qualifying purchase. Welcome stamps are added once when you join.
        </p>
        <h2>Offers and messages</h2>
        <p>
          When you join you agree to receive that restaurant&apos;s loyalty offers by SMS at the
          number you gave. Consent is recorded separately for each restaurant. Every message
          includes “Reply STOP to opt out”. Reply STOP to stop messages from the restaurant that
          last messaged you, or STOPALL to stop messages from every restaurant that uses Patron.
          Turning messages off never affects your card, stamps or rewards.
        </p>
        <h2>Campaigns and special codes</h2>
        <p>
          A special may be public, members-only or targeted. Public and members specials use one
          shared code and can be redeemed once per membership. Targeted specials carry a personal,
          single-use code issued to one member; a forwarded code is not valid for anyone else.
          Codes have no cash value, cannot be exchanged and may be paused or ended by the
          restaurant.
        </p>
        <h2>Spins, challenges and tiers</h2>
        <p>
          Where a restaurant publishes a spin wheel, spins are earned by visits and reward
          milestones — never by purchase. The result is selected by the system, and prizes are
          personal single-use offers. Visit challenges add bonus stamps when their conditions are
          met. Tiers are calculated from recorded visits and may unlock members-only offers. The
          restaurant may change or end a promotion; already-earned rewards are honoured.
        </p>
        <h2>Demo preview</h2>
        <p>
          This build stores demo data in your browser. It carries no service guarantees and does
          not send real SMS.
        </p>
      </section>
      <p>
        <a href="/privacy">Privacy notice</a> · <a href="/demo">Back to demo hub</a>
      </p>
    </main>
  );
}
