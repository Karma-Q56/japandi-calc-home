import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { VerificationStep } from "@/components/patron/VerificationStep";
import { demoRepo, updateDemo } from "@/data/repo";
import { getCardFn, getDataModeFn, getViewerFn, joinCardFn } from "@/server/live";
import { useDemoState } from "@/data/useDemoState";
import { requireRole, setDemoSession } from "@/data/session";
import { ThemeProvider } from "@/theme";
import { isValidSAMobile } from "@/lib/phone";
import { isValidBirthday, MONTH_NAMES } from "@/lib/birthday";
import { rewardJoinPitch } from "@/lib/reward-copy";
import { BackLink } from "@/components/patron/BackLink";
import { VenueMark } from "@/components/patron/kit";
import { venueName } from "@/lib/venue-name";

export const Route = createFileRoute("/r/$slug/join")({
  loader: async ({ params, location }) => {
    const { mode } = await getDataModeFn();
    // Keep the table or friend code so it survives creating a login.
    const query = new URLSearchParams(location.searchStr);
    const kept = new URLSearchParams();
    for (const key of ["src", "ref"]) {
      const value = query.get(key)?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
      if (value) kept.set(key, value);
    }
    const returnTo = `/r/${params.slug}/join${kept.size ? `?${kept.toString()}` : ""}`;
    if (mode !== "live") return { mode, viewer: null, hasCard: false, returnTo };
    const viewer = await getViewerFn();
    const hasCard =
      viewer?.role === "guest" && viewer.customerId
        ? (await getCardFn({ data: { slug: params.slug } })).card !== null
        : false;
    return { mode, viewer, hasCard, returnTo };
  },
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const session = demoRepo.read().session;
      if (!requireRole("guest")(session)) setDemoSession({ role: "guest" });
    }
  },
  component: JoinPage,
});

const venueRoute = getRouteApi("/r/$slug");

function JoinPage() {
  const { mode } = Route.useLoaderData();
  // Live restaurants are not in the sample data, so live has its own page.
  return mode === "live" ? <LiveJoin /> : <DemoJoin />;
}

/**
 * Live joining needs a free Patron login (founder decision, 27 Nov 2026). Phone numbers are
 * not checked yet, see docs/decisions.md.
 */
function LiveJoin() {
  const { slug } = Route.useParams();
  const { viewer, hasCard, returnTo } = Route.useLoaderData();
  const { live } = venueRoute.useLoaderData();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!live) return <PlaceNotFound />;
  const next = encodeURIComponent(returnTo);

  const join = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!agreed) return setError("Please agree to the terms to join.");
    setBusy(true);
    const params = new URLSearchParams(window.location.search);
    const referralCode = params.get("ref")?.trim().slice(0, 20);
    try {
      const result = await joinCardFn({
        data: {
          slug,
          agreed: true,
          marketingSms: true,
          source: params.get("src")?.trim().slice(0, 64) || "link",
          ...(referralCode ? { referralCode } : {}),
        },
      });
      if (result.ok) {
        window.location.assign(`/r/${slug}/card`);
        return;
      }
      setError(result.message);
    } catch {
      setError("We could not add your card. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <main className="guest-page">
      <section className="guest-flow">
        <div className="join-back">
          <BackLink to={`/r/${slug}`} label="Restaurant" />
        </div>
        <div className="guest-panel">
          <section className="guest-step">
            {!viewer ? (
              <>
                <h1>Join the card at {live.name}.</h1>
                <p>Your stamps are kept on a free Patron login. It takes about a minute.</p>
                <div className="join-button-row">
                  <a className="builder-primary" href={`/signup?next=${next}`}>
                    Create a free login
                  </a>
                  <a className="builder-secondary" href={`/login?next=${next}`}>
                    I already have one
                  </a>
                </div>
              </>
            ) : viewer.role !== "guest" ? (
              <>
                <h1>This login runs a restaurant.</h1>
                <p>Use a separate guest login to collect stamps.</p>
                <a className="builder-secondary" href={`/r/${slug}`}>
                  Back to {live.name}
                </a>
              </>
            ) : viewer.needsPhone || !viewer.customerId ? (
              <>
                <h1>Add your mobile number first.</h1>
                <p>The restaurant finds your card with it.</p>
                <a className="builder-primary" href={`/signup?next=${next}`}>
                  Add my number
                </a>
              </>
            ) : hasCard ? (
              <>
                <h1>You already have a card here.</h1>
                <a className="builder-primary" href={`/r/${slug}/card`}>
                  Open my card
                </a>
              </>
            ) : (
              <form onSubmit={(event) => void join(event)}>
                <h1>Join the card at {live.name}.</h1>
                <p>You are logged in as {viewer.name}.</p>
                {/* The same single consent line as demo, so the saved wording is what was shown. */}
                <label className="join-consent-line">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                  />
                  <span>
                    By joining you agree to our <a href="/terms">Terms</a>,{" "}
                    <a href="/privacy">Privacy Policy</a> and to receive {live.name}&apos;s loyalty
                    offers. Reply STOP anytime.
                  </span>
                </label>
                <div className="join-button-row">
                  <button className="builder-primary" type="submit" disabled={busy}>
                    Add my card
                  </button>
                </div>
              </form>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function PlaceNotFound() {
  return (
    <main className="demo-hub page-width">
      <h1>We couldn’t find that place.</h1>
      <p>This join link may be for a paused or renamed venue.</p>
      <a href="/">Back to Patron</a>
    </main>
  );
}

function DemoJoin() {
  const { slug } = Route.useParams();
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
  const [birthdayDay, setBirthdayDay] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (!restaurant) return <PlaceNotFound />;
  const welcome = restaurant.welcomeStamps ?? 0;

  const details = () => {
    setError("");
    if (name.trim().length < 1 || name.trim().length > 40) {
      return setError("Enter your first name (up to 40 letters).");
    }
    if (!isValidSAMobile(phone)) {
      return setError("Enter a valid South African mobile number. Landlines cannot receive SMS.");
    }
    const limit = api.member.checkJoinRateLimit(phone);
    if (!limit.ok) {
      setError(limit.error.message);
      return;
    }
    if (birthdayDay && !birthdayMonth) {
      setError("Choose the birthday month too, or leave both out.");
      return;
    }
    if (birthdayMonth && !birthdayDay) {
      setError("Choose the birthday day too, or leave both out.");
      return;
    }
    if (birthdayDay && birthdayMonth) {
      const birthday = { day: Number(birthdayDay), month: Number(birthdayMonth) };
      if (!isValidBirthday(birthday)) {
        setError("That day does not exist in that month. Check the day and month.");
        return;
      }
    }
    setStep(2);
  };

  const finish = async () => {
    const params =
      typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const source = params?.get("src") || "link";
    const referralCode = params?.get("ref") || undefined;
    if (!agreed) {
      setError("Please agree to the terms to join.");
      return;
    }
    const result = api.member.join({
      slug,
      name,
      phone,
      marketingSms: true,
      loyaltyConsent: agreed,
      source,
      ...(referralCode ? { referralCode } : {}),
      ...(birthdayDay && birthdayMonth
        ? { birthday: { day: Number(birthdayDay), month: Number(birthdayMonth) } }
        : {}),
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
        <header className="guest-header guest-header-venue">
          <a href={`/r/${slug}`} className="guest-venue-link">
            <VenueMark name={venueName(restaurant.name)} theme={restaurant.theme} size="sm" />
            <span>{venueName(restaurant.name)}</span>
          </a>
          <a href="/">Patron home</a>
        </header>
        <section className="guest-flow">
          <div className="join-back">
            {step === 0 ? (
              <BackLink to={`/r/${slug}`} label="Restaurant" />
            ) : (
              <BackLink
                onClick={() => {
                  setError("");
                  setStep(step - 1);
                }}
              />
            )}
          </div>
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
                <h1>Join the regulars at {venueName(restaurant.name)}.</h1>
                <p>{rewardJoinPitch(restaurant.rewardDescription)}.</p>
                {welcome > 0 && (
                  <p className="welcome-stamp-note" role="status">
                    <strong>
                      You start with {welcome} stamp{welcome === 1 ? "" : "s"}.
                    </strong>{" "}
                    That leaves {restaurant.stampsRequired - welcome} to{" "}
                    {restaurant.rewardDescription}.
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
                    {customer ? `Continue as ${customer.name}` : `Join ${venueName(restaurant.name)}`}
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
                <div className="builder-field" role="group" aria-label="Birthday, day and month">
                  <span>Birthday · optional</span>
                  <small className="gx-note" style={{ display: "block" }}>
                    Day and month only, never the year, so we can spoil you on your birthday.
                  </small>
                  <div className="join-birthday-row">
                    <select
                      aria-label="Birthday day"
                      value={birthdayDay}
                      onChange={(event) => setBirthdayDay(event.target.value)}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Birthday month"
                      value={birthdayMonth}
                      onChange={(event) => setBirthdayMonth(event.target.value)}
                    >
                      <option value="">Month</option>
                      {MONTH_NAMES.map((monthName, index) => (
                        <option key={monthName} value={index + 1}>
                          {monthName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
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
          </div>
          <small className="demo-data-note">Demo data · No SMS is sent.</small>
        </section>
      </main>
    </ThemeProvider>
  );
}
