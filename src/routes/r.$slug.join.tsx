import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
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
  const [agreed, setAgreed] = useState(true);
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
  const welcome = restaurant.welcomeStamps ?? 0;

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
    if (!agreed) {
      setError("Please agree to the terms to join.");
      return;
    }
    if (mode === "live") {
      const res = await joinGuestFn({ data: { slug, name, phone, marketingSms: true, source } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
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
      marketingSms: true,
      loyaltyConsent: agreed,
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

  const consentLineNode = (
    <label className="join-consent-line">
      <input
        type="checkbox"
        checked={agreed}
        onChange={(event) => setAgreed(event.target.checked)}
      />
      <span>
        By joining you agree to our <a href="/terms">Terms</a>,{" "}
        <a href="/privacy">Privacy Policy</a> and to receive {restaurant.name}&apos;s loyalty
        offers. Reply STOP anytime.
      </span>
    </label>
  );

  return (
    <ThemeProvider theme={restaurant.theme}>
      <main className="guest-page">
        <header className="guest-header">
          <a href={`/r/${slug}`}>{restaurant.name}</a>
          <a href="/demo">Demo home</a>
        </header>
        <section className="guest-flow">
          <div className="guest-progress" aria-label={`Step ${step + 1} of 3`}>
            {["Welcome", "Details", "Verification"].map((label, index) => (
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
                {welcome > 0 && (
                  <p className="welcome-stamp-note" role="status">
                    <strong>
                      You start with {welcome} stamp{welcome === 1 ? "" : "s"}.
                    </strong>{" "}
                    That leaves {restaurant.stampsRequired - welcome} to {restaurant.rewardDescription}.
                  </p>
                )}
                {customer && (
                  <p className="demo-data-note">
                    You’re browsing as {customer.name}.
                    {existingMembership
                      ? " You already have a card here."
                      : " This join will use a new card."}
                  </p>
                )}
                <div className="join-button-row">
                  <button className="builder-primary" onClick={continueAsGuest}>
                    {customer ? `Continue as ${customer.name}` : `Join ${restaurant.name}`}
                  </button>
                  {consentLineNode}
                </div>
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
                <div className="join-button-row">
                  <button className="builder-primary" onClick={details}>
                    Continue
                  </button>
                </div>
              </section>
            )}
            {step === 2 && <VerificationStep phone={phone} onVerified={finish} />}
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
          <small className="demo-data-note">Demo data · No SMS is sent.</small>
        </section>
        <DemoControlBar />
      </main>
    </ThemeProvider>
  );
}
