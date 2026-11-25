import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import type { Theme } from "@/data/types";
import { ConfirmDialog, PageHeader } from "@/components/patron/dash";
import { LoyaltyCard } from "@/components/patron/LoyaltyCard";
import { PhoneFrame, PreviewOnly, PublishSteps } from "@/components/patron/preview";
import { ThemeEditor } from "@/components/patron/ThemeEditor";
import { themeHasAccessibleContrast } from "@/theme/contrast";
import { getDataModeFn } from "@/server/live";

export const Route = createFileRoute("/app/design")({
  beforeLoad: async () => {
    // Live mode designs the card in the Stamp card tab. Demo mode keeps this page.
    const { mode } = await getDataModeFn();
    if (mode === "live") throw redirect({ to: "/app/loyalty" });
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  component: Design,
});

function Design() {
  const state = useDemoState();
  const restaurant =
    state.restaurants.find((item) => item.id === state.session.restaurantId) ??
    state.restaurants[0]!;
  const [theme, setTheme] = useState<Theme>(restaurant.theme);
  const [step, setStep] = useState(1);
  const [notice, setNotice] = useState("");
  const [published, setPublished] = useState(false);
  const readable = themeHasAccessibleContrast(theme);
  const filled = Math.min(5, Math.max(1, restaurant.stampsRequired - 1));

  const preview = () => {
    if (!readable) {
      setNotice("Text and background are too close to read comfortably. Darken the text or lighten the background.");
      return;
    }
    if (!theme.tagline.trim()) {
      setNotice("Add a short tagline. It sits under your name on the card.");
      return;
    }
    setNotice("");
    setStep(2);
  };

  /** The only place a design reaches guests. */
  const publish = () => {
    if (!readable) {
      setNotice("Text and background are too close to read comfortably. Darken the text or lighten the background.");
      return;
    }
    const result = api.restaurant.update(restaurant.id, { theme });
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice("");
    setPublished(true);
    setStep(1);
  };

  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Design · ${restaurant.name}`}
        title="Card design"
        intro="Colours, stamp shape, logo and background for the card guests keep. You see every change before it goes live."
      />
      <PublishSteps step={step} labels={["Design", "Preview", "Publish"]} />
      {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}

      {step === 1 && (
        <>
          <ThemeEditor theme={theme} onChange={setTheme} name={restaurant.name} />
          <div className="page-actions">
            <button className="builder-primary" onClick={preview}>
              Preview my card
            </button>
            {published && (
              <p role="status" className="gx-note">
                Published. Guests see this design now. Any further edit needs Preview again.
              </p>
            )}
          </div>
          <p className="demo-data-note">
            The same colours and tagline appear on your public page. Nothing changes for guests
            until you publish.
          </p>
        </>
      )}

      {step === 2 && (
        <section className="builder-panel">
          <h2>Your guest card</h2>
          <PhoneFrame label="Guest card preview">
            <LoyaltyCard
              theme={theme}
              name={restaurant.name}
              memberName="Thandi"
              filled={filled}
              total={restaurant.stampsRequired}
              footnote={`${restaurant.stampsRequired - filled} more for ${restaurant.rewardDescription}`}
              animate={false}
            />
          </PhoneFrame>
          {theme.logoStamp && (
            <div className="logo-stamp-preview">
              <figure>
                <img src={theme.logoStamp.filled} alt="Filled logo stamp" width={64} height={64} />
                <figcaption>Stamp collected</figcaption>
              </figure>
              <figure>
                <img src={theme.logoStamp.empty} alt="Empty logo stamp" width={64} height={64} />
                <figcaption>Stamp to go</figcaption>
              </figure>
            </div>
          )}
          <PreviewOnly>
            Preview only. Guests keep the current card until you publish.
          </PreviewOnly>
          <div className="page-actions">
            <button className="guest-back" onClick={() => setStep(1)}>
              Back to editing
            </button>
            <ConfirmDialog
              label="Publish card design"
              question="Publish this design? The guest card and your public page change straight away."
              confirmLabel="Yes, publish"
              buttonClass="builder-primary"
              onConfirm={publish}
            />
          </div>
        </section>
      )}
    </main>
  );
}
