import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { useDemoState } from "@/data/useDemoState";
import { canOpenArea } from "@/lib/auth-rules";
import { APP_URL } from "@/config/app";
import { joinUrl } from "@/lib/qr-links";
import { qrSvg } from "@/lib/qr";
import { QrPrintPack } from "@/components/patron/QrPrintPack";
import { PageHeader } from "@/components/patron/dash";
import { getDataModeFn, getMyRestaurantFn, getViewerFn } from "@/server/live";

export const Route = createFileRoute("/app/qr")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") {
      const viewer = await getViewerFn();
      if (!viewer || !canOpenArea(viewer.role, "app")) throw redirect({ to: "/login" });
      return;
    }
    if (!requireRole("owner", "manager")(demoRepo.read().session)) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, restaurant: null };
    return { mode, restaurant: await getMyRestaurantFn() };
  },
  ssr: false,
  component: QrOwner,
});

function QrOwner() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveQr restaurant={data.restaurant} />;
  return <DemoQr />;
}

function DemoQr() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`${restaurant.name} · QR codes`}
        title="Print your QR pack"
        intro="Put your join code on tables, the counter and takeaway bags. Guests scan it and join your card."
      />
      <QrPrintPack restaurant={restaurant} />
    </main>
  );
}

/** Live: the real join link for this restaurant, with a copy button and its QR image. */
function LiveQr({ restaurant }: { restaurant: { slug: string; published: boolean } | null }) {
  const [origin, setOrigin] = useState(APP_URL);
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Live mode"
          title="Set up your restaurant first"
          intro="Your join code appears here once your restaurant is set up."
        />
      </main>
    );
  }

  const url = joinUrl(origin, restaurant.slug, "qr");
  // The QR maker has a size limit. A very long address must not break the page, so the
  // link and the copy button stay and only the picture is left out.
  let qr: string | null = null;
  try {
    qr = qrSvg(url, "#1f3027", "#ffffff");
  } catch {
    qr = null;
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow="Live mode · QR codes"
        title="Your join code"
        intro="Guests scan this code to join your card. Print it, or copy the link."
      />
      <section className="builder-panel">
        <div className="qr-preview">
          {qr ? <div dangerouslySetInnerHTML={{ __html: qr }} /> : null}
          <div>
            <strong>Join link</strong>
            <p>
              <code>{url}</code>
            </p>
            <div className="page-actions">
              <button type="button" className="builder-secondary" onClick={() => void copy()}>
                Copy link
              </button>
            </div>
            {copied && <p role="status">Link copied.</p>}
            {qr ? null : (
              <p className="demo-data-note">
                This address is too long for a picture code here. Copy the link instead.
              </p>
            )}
            {restaurant.published ? null : (
              <p className="demo-data-note">
                Your restaurant is private (draft) until you publish it. The link works once it is
                published.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
