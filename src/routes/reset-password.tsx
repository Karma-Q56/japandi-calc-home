import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () => ({ meta: [{ title: "Choose a new password | Patron" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This link is missing its token. Ask for a fresh reset link.");
      return;
    }
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setError("That link has expired or was already used. Ask for a fresh one.");
      return;
    }
    setDone(true);
  };

  return (
    <MarketingShell back={{ to: "/login", label: "Back to log in" }}>
      <section className="login-page page-width">
        <div className="login-card">
          <h1>Choose a new password.</h1>
          {done ? (
            <>
              <p>Your password is changed. You can sign in with it now.</p>
              <a className="builder-primary" href="/login">
                Go to log in
              </a>
            </>
          ) : (
            <form className="login-form" onSubmit={(event) => void submit(event)}>
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button className="builder-primary login-continue" type="submit">
                Save my new password
              </button>
            </form>
          )}
          {error && (
            <p className="login-status" role="alert">
              {error}{" "}
              <a href="/forgot-password">Ask for a fresh link</a>.
            </p>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
