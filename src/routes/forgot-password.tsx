import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { authClient } from "@/lib/auth-client";
import { getDataModeFn } from "@/server/live";

export const Route = createFileRoute("/forgot-password")({
  loader: async () => getDataModeFn(),
  head: () => ({
    meta: [{ title: "Forgot your password | Patron" }],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const { mode } = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    // The demo has no accounts or email, so nothing is asked of the server.
    if (mode !== "live") {
      setError("This is the demo, so no email is sent. Use Log in to pick a demo account.");
      return;
    }
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (result.error) {
      // The same message either way, so the form never reveals an account.
      setError("If that email is registered, a reset link is on its way.");
      return;
    }
    setSent(true);
  };

  return (
    <MarketingShell back={{ to: "/login", label: "Back to log in" }}>
      <section className="login-page page-width">
        <div className="login-card">
          <h1>Reset your password.</h1>
          {sent ? (
            <>
              <p>
                If that email is registered, a link is on its way. It expires in one hour.
              </p>
              <a className="builder-secondary" href="/login">
                Back to log in
              </a>
            </>
          ) : (
            <form className="login-form" onSubmit={(event) => void submit(event)}>
              <label htmlFor="reset-email">Email address</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button className="builder-primary login-continue" type="submit">
                Send the reset link
              </button>
              <p className="demo-data-note">
                We do not say whether an email is registered.
              </p>
            </form>
          )}
          {error && (
            <p className="login-status" role="status">
              {error}
            </p>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
