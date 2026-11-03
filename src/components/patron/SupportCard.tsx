import { brand, whatsappLink } from "@/lib/patron";
import { siteDetails } from "@/config/site-details";

export function SupportCard() {
  return (
    <section className="builder-panel">
      <h2>Need help?</h2>
      <p>
        Message us on{" "}
        <a href={whatsappLink("Hi Patron! I need help.")} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>{" "}
        or email <a href={`mailto:${siteDetails.supportEmail}?subject=Patron%20support`}>the {brand.name} team</a>.
      </p>
      <p className="demo-data-note">
        Contact details are placeholders in this preview. {siteDetails.supportHours}.
      </p>
      <details>
        <summary>Staff cheat sheet (one page)</summary>
        <ol>
          <li>Ask the guest to open their member code.</li>
          <li>Type the code or scan the QR at the till.</li>
          <li>Press Add stamp once, too-soon means wait.</li>
          <li>Rewards redeem once; undo only fixes mistakes.</li>
        </ol>
      </details>
    </section>
  );
}
