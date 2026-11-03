import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { authClient } from "@/lib/auth-client";
import { landingForRole } from "@/lib/auth-rules";
import { completePhoneFn, getDataModeFn, getViewerFn } from "@/server/live";

export const Route = createFileRoute("/signup")({
  loader: async () => getDataModeFn(),
  head: () => ({
    meta: [
      { title: "Create your account | Patron" },
      {
        name: "description",
        content: "One account for every loyalty card, stamp and reward on Patron.",
      },
    ],
  }),
  component: SignUpPage,
});

function SignUpPage() {
  const { mode } = Route.useLoaderData();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsPhone, setNeedsPhone] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "live") return;
    void getViewerFn().then((viewer) => {
      if (!viewer) return;
      if (viewer.needsPhone) setNeedsPhone(true);
      else if (viewer.role !== "guest" || viewer.customerId) {
        void navigate({ to: landingForRole(viewer.role) });
      }
    });
  }, [mode, navigate]);

  const signUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const signUpBody = { name, email, password, phoneNumber: phone } as unknown as Parameters<
      typeof authClient.signUp.email
    >[0];
    const result = await authClient.signUp.email(signUpBody);
    if (result.error) {
      setStatus("We could not create that account. Check your details and try again.");
      setBusy(false);
      return;
    }
    const viewer = await getViewerFn();
    if (!viewer) {
      setStatus("Your account was made, but the session did not start. Try signing in.");
      setBusy(false);
      return;
    }
    void navigate({ to: landingForRole(viewer.role) });
    setBusy(false);
  };

  const finishPhone = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const result = await completePhoneFn({ data: phone });
    if (!result.ok) {
      setStatus(result.message);
      setBusy(false);
      return;
    }
    void navigate({ to: landingForRole(result.viewer.role) });
    setBusy(false);
  };

  if (mode !== "live") {
    return (
      <MarketingShell>
        <section className="login-page page-width">
          <div className="login-card">
            <h1>Demo mode.</h1>
            <p>Real accounts are switched off in this preview. Use the demo accounts to look around.</p>
            <a className="builder-primary" href="/login">
              Back to log in
            </a>
          </div>
        </section>
      </MarketingShell>
    );
  }

  if (needsPhone) {
    return (
      <MarketingShell>
        <section className="login-page page-width">
          <div className="login-card">
            <h1>One last detail.</h1>
            <p>Add the mobile number the restaurant should use for your card and messages.</p>
            <form className="login-form" onSubmit={(event) => void finishPhone(event)}>
              <label htmlFor="signup-phone">Mobile number</label>
              <input
                id="signup-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="082 123 4567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
              <button className="builder-primary login-continue" type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save and continue"}
              </button>
            </form>
            {status && <p className="login-status" role="alert">{status}</p>}
          </div>
        </section>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <section className="login-page page-width">
        <div className="login-card">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Create your account
          </span>
          <h1>One account, every card.</h1>
          <p className="login-lede">
            Your name and number are shared only with a restaurant after you join its card.
          </p>
          <form className="login-form" onSubmit={(event) => void signUp(event)}>
            <label htmlFor="signup-name">Preferred name</label>
            <input
              id="signup-name"
              autoComplete="given-name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <label htmlFor="signup-phone">Mobile number</label>
            <input
              id="signup-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="082 123 4567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
            <label htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className="demo-data-note">Use at least 10 letters or numbers.</p>
            <button className="builder-primary login-continue" type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create my account"}
            </button>
          </form>
          <p className="login-new">
            Already have an account? <a href="/login">Log in</a>
          </p>
          {status && (
            <p className="login-status" role="alert">
              {status}
            </p>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
