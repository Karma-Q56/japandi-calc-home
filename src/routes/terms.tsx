import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/patron/MarketingShell";

export const Route = createFileRoute("/terms")({
  component: Terms,
});

function Terms() {
  return (
    <MarketingShell back={{ to: "/", label: "Back" }}>
      <section className="marketing-page-hero page-width">
        <p className="eyebrow">
          <span className="eyebrow-line" />
          Legal · Draft
        </p>
        <h1>Terms of use.</h1>
        <p>Draft wording for the demo, needs lawyer review before any pilot.</p>
      </section>
      <section className="section page-width legal-page">
        <nav className="legal-toc" aria-label="On this page">
          <h2>On this page</h2>
          <ol>
            <li>
              <a href="#loyalty-cards">Loyalty cards</a>
            </li>
            <li>
              <a href="#offers">Offers and messages</a>
            </li>
            <li>
              <a href="#codes">Campaigns and special codes</a>
            </li>
            <li>
              <a href="#spins">Spins, challenges and tiers</a>
            </li>
            <li>
              <a href="#friends">Bring a friend</a>
            </li>
            <li>
              <a href="#demo">Demo preview</a>
            </li>
          </ol>
        </nav>
        <h2 id="loyalty-cards">Loyalty cards</h2>
        <p>
          A loyalty card is offered by the restaurant you join, not by Patron. Each restaurant sets
          its own stamp target, reward and visit rules. Stamps are only added by restaurant staff
          after a qualifying purchase. Welcome stamps are added once when you join.
        </p>
        <h2 id="offers">Offers and messages</h2>
        <p>
          When you join you agree to receive that restaurant&apos;s loyalty offers by SMS at the
          number you gave. Consent is recorded separately for each restaurant. Every message
          includes “Reply STOP to opt out”. Reply STOP to stop messages from the restaurant that
          last messaged you, or STOPALL to stop messages from every restaurant that uses Patron.
          Turning messages off never affects your card, stamps or rewards.
        </p>
        <h2 id="codes">Campaigns and special codes</h2>
        <p>
          A special may be public, members-only or targeted. Public and members specials use one
          shared code and can be redeemed once per membership. Targeted specials carry a personal,
          single-use code issued to one member; a forwarded code is not valid for anyone else.
          Codes have no cash value, cannot be exchanged and may be paused or ended by the
          restaurant.
        </p>
        <h2 id="spins">Spins, challenges and tiers</h2>
        <p>
          Where a restaurant publishes a spin wheel, spins are earned by visits and reward
          milestones, never by purchase. The result is selected by the system, and prizes are
          personal single-use offers. Visit challenges add bonus stamps when their conditions are
          met. Tiers are calculated from recorded visits and may unlock members-only offers. The
          restaurant may change or end a promotion; already-earned rewards are honoured.
        </p>
        <h2 id="friends">Bring a friend</h2>
        <p>
          Where a restaurant offers it, each guest gets a personal share code. A friend who joins
          through it earns a reward for both of you, but only after the friend&apos;s first
          stamped visit. Rewards are single-use personal offers and the restaurant may limit how
          many friends you can bring each month. Codes cannot be traded and have no cash value.
        </p>
        <h2 id="demo">Demo preview</h2>
        <p>
          This build stores demo data in your browser. It carries no service guarantees and does
          not send real SMS.
        </p>
      </section>
      <p className="legal-more">
        <a href="/privacy">Privacy notice</a> · <a href="/contact">Contact us</a>
      </p>
    </MarketingShell>
  );
}
