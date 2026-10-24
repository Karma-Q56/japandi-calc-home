import { brand } from "@/lib/patron";

const WHATSAPP = "https://wa.me/27820000000?text=Hi%20Patron!%20I%20need%20help.";
const EMAIL = "mailto:hello@patron.demo?subject=Patron%20support";

export function SupportCard() {
  return (
    <section className="builder-panel">
      <h2>Need help?</h2>
      <p>
        Message us on <a href={WHATSAPP}>WhatsApp</a> or email{" "}
        <a href={EMAIL}>the {brand.name} team</a>.
      </p>
      <details>
        <summary>Staff cheat sheet (one page)</summary>
        <ol>
          <li>Ask the guest to open their member code.</li>
          <li>Type the code or scan the QR at the till.</li>
          <li>Press Add stamp once — too-soon means wait.</li>
          <li>Rewards redeem once; undo only fixes mistakes.</li>
        </ol>
      </details>
    </section>
  );
}
