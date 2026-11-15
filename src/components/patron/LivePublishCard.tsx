import { useEffect, useState } from "react";
import {
  getPublishStateFn,
  publishRestaurantFn,
  setRestaurantListedFn,
  unpublishRestaurantFn,
} from "@/server/live-publish-fns";
import {
  READINESS_STEPS,
  UNPUBLISH_CONFIRM,
  firstMissingReason,
  isReady,
  publishErrorMessage,
  statusLabel,
  type PublishStatus,
  type Readiness,
} from "@/lib/live-publish";
import { Badge, ConfirmDialog } from "@/components/patron/dash";

type State = {
  slug: string;
  status: PublishStatus;
  listed: boolean;
  readiness: Readiness;
};

/** Live owner card: the checklist, Publish, Unpublish and the listing toggle. */
export function LivePublishCard() {
  const [state, setState] = useState<State | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const next = await getPublishStateFn();
    setState(next);
    setLoaded(true);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!loaded || !state) return null;

  const ready = isReady(state.readiness);
  const reason = firstMissingReason(state.readiness);
  const isLive = state.status === "active";

  const copyLink = async () => {
    if (!state) return;
    await navigator.clipboard.writeText(`${window.location.origin}/r/${state.slug}`);
    setCopied(true);
  };

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setBusy(true);
    setMessage("");
    const result = await action();
    setBusy(false);
    if (result.ok) {
      setMessage("");
      await load();
    } else {
      setMessage(result.message);
    }
  };

  return (
    <section className="builder-panel" aria-labelledby="publish-heading">
      <h2 id="publish-heading">Your page</h2>
      <p>
        <Badge tone={isLive ? "active" : undefined}>{statusLabel(state.status)}</Badge>
      </p>
      {isLive ? (
        <>
          <p>Guests can find your page and join. Your public page is at /r/{state.slug}.</p>
          <div className="page-actions">
            <button type="button" className="builder-secondary" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy public link"}
            </button>
            <a href="/app/qr">Open my QR page</a>
          </div>
        </>
      ) : (
        <p>Your restaurant is private (draft) until you publish it. Guests cannot find it yet.</p>
      )}

      {!isLive && (
        <>
          <p className="demo-data-note">Finish these steps, then publish.</p>
          <ul>
            {READINESS_STEPS.map((step) => {
              const done = state.readiness[step.key];
              return (
                <li key={step.key}>
                  {done ? "Done: " : "To do: "}
                  {step.label}
                  {done ? null : (
                    <>
                      {" "}
                      <a href={step.href}>{step.fix}</a>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {reason && <p className="demo-data-note">{reason}</p>}
        </>
      )}

      <div className="page-actions">
        {isLive ? (
          <ConfirmDialog
            label="Unpublish"
            question={UNPUBLISH_CONFIRM}
            confirmLabel="Yes, unpublish"
            onConfirm={() => void run(() => unpublishRestaurantFn())}
          />
        ) : (
          <button
            type="button"
            className="builder-primary"
            disabled={!ready || busy}
            onClick={() => void run(() => publishRestaurantFn())}
          >
            Publish my restaurant
          </button>
        )}
        {isLive && (
          <label className="guest-consent">
            <input
              type="checkbox"
              checked={state.listed}
              disabled={busy}
              onChange={(event) =>
                void run(() => setRestaurantListedFn({ data: { listed: event.target.checked } }))
              }
            />
            <span>Show my restaurant in the public list</span>
          </label>
        )}
      </div>

      {message && (
        <p role="alert" className="demo-data-note">
          {message || publishErrorMessage(null)}
        </p>
      )}
    </section>
  );
}
