import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { authClient } from "@/lib/auth-client";
import { landingForRole } from "@/lib/auth-rules";
import { getDataModeFn, getViewerFn } from "@/server/live";
import { DEMO_ACCOUNTS, signInAsDemoAccount, type DemoAccount } from "@/lib/demo-signin";

export const Route = createFileRoute("/login")({
  loader: async () => getDataModeFn(),
  head: () => ({
    meta: [
      { title: "Log in | Patron" },
      {
        name: "description",
        content:
          "Log in to see your loyalty cards, stamps and rewards. Restaurant owners and staff sign in here too.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { mode } = Route.useLoaderData();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = (account: DemoAccount, message: string) => {
    const to = signInAsDemoAccount(account);
    setStatus(message);
    void navigate({ to });
  };

  const goToLanding = async () => {
    const viewer = await getViewerFn();
    if (!viewer) {
      setStatus("That sign-in did not stick. Please try again.");
      return;
    }
    void navigate({ to: landingForRole(viewer.role) });
  };

  // Returning from Google lands here with a session already set.
  useEffect(() => {
    if (mode !== "live") return;
    void getViewerFn().then((viewer) => {
      if (viewer) void navigate({ to: landingForRole(viewer.role) });
    });
  }, [mode, navigate]);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setStatus("Those details did not match. Check your email and password.");
      setBusy(false);
      return;
    }
    await goToLanding();
    setBusy(false);
  };

  const google = async () => {
    setStatus("");
    await authClient.signIn.social({ provider: "google", callbackURL: "/login" });
  };

  return (
    <MarketingShell back={{ to: "/", label: "Back" }}>
      <section className="login-page page-width">
        <div className="login-card">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Log in
          </span>
          <h1>Welcome back.</h1>
          <p className="login-lede">
            {mode === "live"
              ? "Your cards, your stamps and the offers waiting for you."
              : "This preview uses demo accounts. Real sign-in runs when live mode is on."}
          </p>

          {mode === "live" ? (
            <>
              {import.meta.env["VITE_AUTH_GOOGLE"] === "1" && (
                <>
                  <button type="button" className="login-google" onClick={() => void google()}>
                    <span className="login-google-mark" aria-hidden>
                      G
                    </span>
                    Continue with Google
                  </button>
                  <div className="login-divider" role="presentation">
                    <span>or</span>
                  </div>
                </>
              )}
              <form className="login-form" onSubmit={(event) => void signIn(event)}>
                <label htmlFor="login-email">Email address</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button type="submit" className="builder-primary login-continue" disabled={busy}>
                  {busy ? "Signing in..." : "Sign in"} <ArrowRight size={16} />
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                className="login-google"
                onClick={() => enter("diner", "Opening the demo diner account...")}
              >
                <span className="login-google-mark" aria-hidden>
                  G
                </span>
                Continue with Google
              </button>
              <div className="login-divider" role="presentation">
                <span>or</span>
              </div>
              <form
                className="login-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  enter("diner", "Opening the demo diner account...");
                }}
              >
                <label htmlFor="login-email">Email address</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
                <button type="submit" className="builder-primary login-continue">
                  Continue <ArrowRight size={16} />
                </button>
              </form>
              <details className="login-demo">
                <summary>Demo accounts</summary>
                <div className="login-demo-list">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() =>
                        enter(
                          account.id,
                          `Opening the demo ${account.label.toLowerCase()} account...`,
                        )
                      }
                    >
                      <strong>{account.label}</strong>
                      <span>{account.text}</span>
                    </button>
                  ))}
                </div>
                <p className="login-demo-note">
                  This preview has no real password or account yet. Each button opens the matching
                  demo account in this browser.
                </p>
              </details>
            </>
          )}

          <p className="login-new">
            <a href="/forgot-password">Forgot password?</a>
          </p>
          <p className="login-new">
            New here? <a href="/signup">Create account</a>
          </p>
          <p className="login-note" role="note">
            Restaurant owners and staff sign in here too. We take you to the right place.
          </p>

          {status && (
            <p className="login-status" role="status">
              {status}
            </p>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
