import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/patron/MarketingShell";
import { DEMO_ACCOUNTS, signInAsDemoAccount, type DemoAccount } from "@/lib/demo-signin";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in, Patron" },
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
  const navigate = useNavigate();
  const [status, setStatus] = useState("");

  const enter = (account: DemoAccount, message: string) => {
    const to = signInAsDemoAccount(account);
    setStatus(message);
    void navigate({ to });
  };

  return (
    <MarketingShell>
      <section className="login-page page-width">
        <div className="login-card">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Log in
          </span>
          <h1>Welcome back.</h1>
          <p className="login-lede">Your cards, your stamps and the offers waiting for you.</p>

          <button
            type="button"
            className="login-google"
            onClick={() => enter("diner", "Opening the demo diner account…")}
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
              enter("diner", "Opening the demo diner account…");
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

          <p className="login-note" role="note">
            Restaurant owners and staff sign in here too. We&apos;ll take you to the right place.
          </p>

          <p className="login-new">
            New here? <a href="/for-diners">Create your account</a>
          </p>

          <details className="login-demo">
            <summary>Demo accounts</summary>
            <div className="login-demo-list">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() =>
                    enter(account.id, `Opening the demo ${account.label.toLowerCase()} account…`)
                  }
                >
                  <strong>{account.label}</strong>
                  <span>{account.text}</span>
                </button>
              ))}
            </div>
            <p className="login-demo-note">
              This preview has no real password or account yet. Each button opens the matching demo
              account in this browser.
            </p>
          </details>

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
