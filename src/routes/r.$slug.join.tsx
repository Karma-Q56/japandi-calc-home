import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { getConsentWording } from "@/config/consent";
import { DemoControlBar } from "@/components/patron/DemoControlBar";
import { VerificationStep } from "@/components/patron/VerificationStep";
import { demoRepo, updateDemo } from "@/data/repo";
import { getDataModeFn, joinGuestFn } from "@/server/live";
import { useDemoState } from "@/data/useDemoState";
import { requireRole, setDemoSession } from "@/data/session";
import { ThemeProvider } from "@/theme";
import { isValidSAMobile } from "@/lib/phone";
import { rewardJoinPitch } from "@/lib/reward-copy";

export const Route = createFileRoute("/r/$slug/join")({
  loader: async () => {
    const { mode } = await getDataModeFn();
    return { mode };
  },
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const session = demoRepo.read().session;
      if (!requireRole("guest")(session)) setDemoSession({ role: "guest" });
    }
  },
  component: JoinPage,
});

function JoinPage() {
  const { slug } = Route.useParams();
  const { mode } = Route.useLoaderData();
  const state = useDemoState();
  const restaurant = state.restaurants.find(
    (item) => item.slug === slug && item.status === "active",
  );
  const session = state.session;
  const customer = session.customerId
    ? state.customers.find((item) => item.id === session.customerId)
    : undefined;
  const existingMembership = customer
    ? state.memberships.find(
        (item) => item.customerId === customer.id && item.restaurantId === restaurant?.id,
      )
    : undefined;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+27 ");
  const [loyaltyConsent, setLoyaltyConsent] = useState(false);
  const [marketingSms, setMarketingSms] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (!restaurant) {
    return (
      <main className="demo-hub page-width">
        <h1>We couldn’t find that place.</h1>
        <p>This join link may be for a paused or renamed venue.</p>
        <a href="/demo">Back to demo hub</a>
      </main>
    );
  }
  const loyalty = getConsentWording("loyalty", restaurant.name);
  const marketing = getConsentWording("marketing_sms", restaurant.name);

  const details = () => {
    setError("");
    if (name.trim().length < 1 || name.trim().length > 40) {
      return setError("Enter your first name (up to 40 characters).");
    }
    if (!isValidSAMobile(phone)) {
      return setError("Enter a valid South African mobile number. Landlines cannot receive SMS.");
    }
    const limit = api.member.checkJoinRateLimit(phone);
    if (!limit.ok) {
      setError(limit.error.message);
      return;
    }
    setStep(2);
  };

  const finish = async () => {
    const source =
      typeof window === "undefined"
        ? "link"
        : new URLSearchParams(window.location.search).get("src") || "link";
    if (mode === "live") {
      const res = await joinGuestFn({ data: { slug, name, phone, marketingSms, source } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // Pre-auth seam: the card page reads customerId from search until the
      // auth slice binds the server session to the customer.
      void navigate({
        to: "/r/$slug/card",
        params: { slug },
        search: { customerId: res.customerId },
      });
      return;
    }
    const result = api.member.join({
      slug,
      name,
      phone,
      marketingSms,
      loyaltyConsent,
      source,
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    void navigate({ to: "/r/$slug/card", params: { slug }, search: {} });
  };

  const continueAsGuest = () => {
    if (customer && existingMembership) {
      void navigate({ to: "/r/$slug/card", params: { slug }, search: {} });
    } else {
      setStep(1);
    }
  };

  const joinAsSomeoneElse = () => {
    updateDemo((current) => ({
      ...current,
      session: { role: "guest" },
    }));
    setStep(1);
  };

  return (
    <ThemeProvider theme={restaurant.theme}>
      <main className="guest-page">
        <header className="guest-header">
          <a href={`/r/${slug}`}>{restaurant.name}</a>
          <a href="/demo">Demo home</a>
        </header>
        <section className="guest-flow">
          <div className="guest-progress" aria-label={`Step ${step + 1} of 4`}>
            {["Welcome", "Details", "Consent", "Verification"].map((label, index) => (
              <span className={index === step ? "active" : ""} key={label}>
                {index + 1} {label}
              </span>
            ))}
          </div>
          <div className="guest-panel">
            {step === 0 && (
              <section className="guest-step">
                <span className="eyebrow">Good food · familiar faces</span>
                <h1>Join the regulars at {restaurant.name}.</h1>
                <p>{rewardJoinPitch(restaurant.rewardDescription)}.</p>
                {customer && (
                  <p className="demo-data-note">
                    You’re browsing as {customer.name}.
                    {existingMembership
                      ? " You already have a card here."
                      : " This join will use a new card."}
                  </p>
                )}
                <button className="builder-primary" onClick={continueAsGuest}>
                  {customer ? `Continue as ${customer.name}` : "Join"}
                </button>
                {customer && (
                  <button className="guest-back" onClick={joinAsSomeoneElse}>
                    Not you? Join as someone else
                  </button>
                )}
              </section>
            )}
            {step === 1 && (
              <section className="guest-step">
                <span className="eyebrow">Your details</span>
                <h2>What should we call you?</h2>
                <label className="builder-field">
                  First name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={40}
                    autoComplete="given-name"
                  />
                </label>
                <label className="builder-field">
                  Mobile number
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+27 82 123 4567"
                  />
                </label>
                <button className="builder-primary" onClick={details}>
                  Continue
                </button>
              </section>
            )}
            {step === 2 && (
              <section className="guest-step">
                <span className="eyebrow">Your choices</span>
                <h2>Your card works either way.</h2>
                <label className="guest-consent">
                  <input
                    type="checkbox"
                    checked={loyaltyConsent}
                    onChange={(event) => setLoyaltyConsent(event.target.checked)}
                  />
                  <span>
                    {loyalty.text} <small>Required · {loyalty.version}</small>
                  </span>
                </label>
                <label className="guest-consent">
                  <input
                    type="checkbox"
                    checked={marketingSms}
                    onChange={(event) => setMarketingSms(event.target.checked)}
                  />
                  <span>
                    {marketing.text} <small>Optional · {marketing.version}</small>
                  </span>
                </label>
                <button
                  className="builder-primary"
                  disabled={!loyaltyConsent}
                  onClick={() => {
                    setError("");
                    setStep(3);
                  }}
                >
                  Continue
                </button>
              </section>
            )}
            {step === 3 && <VerificationStep phone={phone} onVerified={finish} />}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            {step > 0 && (
              <button
                className="guest-back"
                onClick={() => {
                  setError("");
                  setStep(step - 1);
                }}
              >
                Back
              </button>
            )}
          </div>
          <small className="demo-data-note">Demo data · No SMS is sent</small>
        </section>
        <DemoControlBar />
      </main>
    </ThemeProvider>
  );
}
