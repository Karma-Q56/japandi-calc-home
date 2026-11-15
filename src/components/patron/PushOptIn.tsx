import { useEffect, useState } from "react";
import { enableBrowserPush, disableBrowserPush } from "@/lib/web-push-client";
import { getPushStateFn, subscribePushFn, unsubscribePushFn } from "@/server/live-push-fns";
import { Helper } from "@/components/patron/dash";

/**
 * Device level opt in for web push (D17). Separate from the per restaurant
 * demo switches on the settings page. Plain words for restaurant owners.
 */
type Phase = "checking" | "off" | "on" | "unsupported" | "needs-home-screen";

const PUBLIC_KEY: string = import.meta.env["VITE_VAPID_PUBLIC_KEY"] ?? "";

/** iPhone and iPad Safari only allow web push from a Home Screen app. */
function isIosOutsideHomeScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia?.("(display-mode: standalone)").matches;
  return ios && !standalone;
}

function browserCanPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function PushOptIn() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isIosOutsideHomeScreen()) {
        if (!cancelled) setPhase("needs-home-screen");
        return;
      }
      if (!browserCanPush()) {
        if (!cancelled) setPhase("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? null;
      const server = await getPushStateFn({ data: { endpoint } });
      if (!cancelled) setPhase(endpoint && server.subscribed ? "on" : "off");
    })().catch(() => {
      if (!cancelled) setPhase("off");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const subscription = await enableBrowserPush(PUBLIC_KEY);
      const result = await subscribePushFn({ data: subscription });
      if (result.ok) {
        setPhase("on");
        setMessage("Notifications are on for this device.");
      } else {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const endpoint = await disableBrowserPush();
      if (endpoint) await unsubscribePushFn({ data: { endpoint } });
      setPhase("off");
      setMessage("Notifications are off for this device.");
    } catch {
      setMessage("Could not turn off notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="push-optin-title" className="push-optin">
      <h2 id="push-optin-title">Phone notifications</h2>

      {phase === "checking" && <p role="status">Checking this device...</p>}

      {phase === "unsupported" && (
        <Helper>This browser cannot send notifications. Try another browser on this device.</Helper>
      )}

      {phase === "needs-home-screen" && (
        <div>
          <p>To get notifications on an iPhone, first add this page to your Home Screen.</p>
          <ol>
            <li>Tap the Share button in Safari.</li>
            <li>Choose "Add to Home Screen".</li>
            <li>Open the app from your Home Screen, then come back here.</li>
          </ol>
        </div>
      )}

      {phase === "off" && (
        <div>
          <p>Get a message when a restaurant you visit has a new offer or a reward ready.</p>
          <button type="button" className="btn" onClick={turnOn} disabled={busy}>
            {busy ? "Turning on..." : "Turn on notifications"}
          </button>
        </div>
      )}

      {phase === "on" && (
        <div>
          <p>Notifications are on for this device.</p>
          <button type="button" className="btn" onClick={turnOff} disabled={busy}>
            {busy ? "Turning off..." : "Turn off notifications"}
          </button>
        </div>
      )}

      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
