import { useEffect, useMemo, useState } from "react";
import { APP_URL } from "@/config/app";
import { downloadQrPng, qrSvg } from "@/lib/qr";
import { downloadBlob, qrPdf } from "@/lib/qr-pdf";
import { joinUrl } from "@/lib/qr-links";
import type { Restaurant } from "@/data/types";

const LAYOUTS = [
  { id: "table-tent", label: "Table tent", source: "table-tent", hint: "A5, folded. Sits beside the salt." },
  { id: "counter-sign", label: "Counter sign", source: "counter-sign", hint: "A5, upright. For the till or door." },
  { id: "sticker", label: "Square sticker", source: "sticker", hint: "80mm square. Bags, cups and windows." },
  { id: "poster", label: "A4 poster", source: "poster", hint: "A4. For the wall or the window." },
] as const;

type LayoutId = (typeof LAYOUTS)[number]["id"];

export function QrPrintPack({
  restaurant,
  logoVersion = null,
}: {
  restaurant: Restaurant;
  /** Live logo version. When set, the QR shows the logo unless the plain switch is on. */
  logoVersion?: number | null;
}) {
  const [layoutId, setLayoutId] = useState<LayoutId>("table-tent");
  const [plain, setPlain] = useState(false);
  const [notice, setNotice] = useState("");
  const logo =
    logoVersion !== null && !plain
      ? { href: `/r/${restaurant.slug}/logo?v=${logoVersion}` }
      : undefined;
  const layout = LAYOUTS.find((item) => item.id === layoutId) ?? LAYOUTS[0];
  // Start with the configured address on both server and client, then use the
  // browser's own origin after mount. Reading window during the first render
  // made the server and client markup disagree.
  const [origin, setOrigin] = useState(APP_URL);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = useMemo(
    () => joinUrl(origin, restaurant.slug, layout.source),
    [origin, restaurant.slug, layout.source],
  );
  const foreground = restaurant.theme.ink;
  const background = restaurant.theme.paper;

  const downloadPng = async () => {
    try {
      await downloadQrPng(
        url,
        `${restaurant.slug}-${layout.id}.png`,
        foreground,
        background,
      );
      setNotice("PNG downloaded. It uses your card colours.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export the QR code.");
    }
  };

  const downloadPdf = () => {
    downloadBlob(
      qrPdf({
        url,
        restaurantName: restaurant.name,
        reward: restaurant.rewardDescription,
        label: layout.label,
        foreground,
        background,
      }),
      `${restaurant.slug}-${layout.id}.pdf`,
    );
    setNotice("PDF downloaded at A4 size, ready to print.");
  };

  return (
    <section className="qr-pack">
      <div className="qr-pack-controls">
        <label className="builder-field">
          Layout
          <select value={layoutId} onChange={(event) => setLayoutId(event.target.value as LayoutId)}>
            {LAYOUTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {logoVersion !== null && (
          <label className="builder-field">
            <input type="checkbox" checked={plain} onChange={(event) => setPlain(event.target.checked)} />
            Use plain QR code
          </label>
        )}
        <button className="builder-secondary no-print" onClick={() => window.print()}>
          Print this layout
        </button>
        <button className="builder-primary no-print" onClick={() => void downloadPng()}>
          Download PNG
        </button>
        <button className="builder-secondary no-print" onClick={downloadPdf}>
          Download PDF
        </button>
      </div>
      <p className="demo-data-note no-print">
        {layout.hint} The preview uses your card colours and logo. Every code points to{" "}
        <code>/r/{restaurant.slug}/join</code> with a tag for this layout.
      </p>

      <article
        className={`qr-print-card qr-layout-${layout.id}`}
        style={{
          background,
          color: foreground,
          borderColor: `color-mix(in oklab, ${foreground} 24%, ${background})`,
        }}
        aria-label={`${layout.label} preview`}
      >
        {restaurant.theme.logo && (
          <img className="qr-logo" src={restaurant.theme.logo} alt={`${restaurant.name} logo`} />
        )}
        <div
          className="qr-code"
          style={{ background }}
          dangerouslySetInnerHTML={{ __html: qrSvg(url, foreground, background, logo) }}
        />
        <div className="qr-copy">
          <span className="eyebrow" style={{ color: foreground }}>
            {restaurant.name}
          </span>
          <h2 style={{ color: foreground }}>Join our regulars.</h2>
          <p style={{ color: foreground }}>
            Scan to collect stamps and enjoy {restaurant.rewardDescription.toLowerCase()}.
          </p>
          <strong>{layout.label}</strong>
          <small>
            {restaurant.stampsRequired} stamps · no app needed
          </small>
        </div>
      </article>

      <p className="demo-data-note no-print">
        The QR image is the real code for this layout. Check one print before you order a stack.
      </p>
      {notice && (
        <p className="demo-data-note no-print" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
