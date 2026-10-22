import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDemoState } from "@/data/useDemoState";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { maskPhone } from "@/lib/phone";
import { enableBrowserPush, disableBrowserPush, showLocalPushTest } from "@/lib/web-push-client";

export const Route = createFileRoute("/me/settings")({
  beforeLoad: () => {
    if (
      !requireRole("guest")(demoRepo.read().session) ||
      (typeof window !== "undefined" && !demoRepo.read().session.customerId)
    )
      throw redirect({ to: "/demo" });
  },
  component: GuestSettings,
});
function GuestSettings() {
  const state = useDemoState();
  const customerId = state.session.customerId!;
  const customer = state.customers.find((item) => item.id === customerId);
  const [name, setName] = useState(customer?.name ?? "");
  const [birthday, setBirthday] = useState(customer?.birthday ?? "");
  const [notice, setNotice] = useState("");
  const [pushBusy, setPushBusy] = useState<string | null>(null);
  // Fill the form once the demo session/customer is available after hydration.
  useEffect(() => {
    if (!customer) return;
    setName(customer.name);
    setBirthday(customer.birthday ?? "");
  }, [customer]);
  if (!customer)
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>We couldn’t find that guest.</h1>
          <p>This demo guest may have been reset.</p>
          <a className="builder-primary" href="/demo">
            Back to demo hub
          </a>
        </section>
      </main>
    );
  const memberships = state.memberships.filter((item) => item.customerId === customerId);
  const save = () => {
    const result = api.member.updateProfile(customerId, {
      name,
      ...(birthday ? { birthday } : {}),
    });
    setNotice(result.ok ? "Profile saved." : result.error.message);
  };
  const download = () => {
    const result = api.member.downloadData(customerId);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "patron-demo-data.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Your demo data was downloaded as JSON.");
  };
  const deletion = state.dataRequests.find((item) => item.customerId === customerId);
  return (
    <main className="guest-page">
      <header className="guest-header">
        <a href="/me">← My cards</a>
        <span>Settings</span>
      </header>
      <section className="guest-card-content">
        <p className="eyebrow">Your details</p>
        <h1>Settings.</h1>
        {customer.deleted ? (
          <section className="guest-panel">
            <h2>Your personal details have been cleared.</h2>
            <p>Membership and visit counts remain in demo history.</p>
            <p>Data request status: {deletion?.status ?? "open"}</p>
          </section>
        ) : (
          <section className="guest-panel">
            <label className="builder-field">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
              />
            </label>
            <label className="builder-field">
              Phone number
              <input value={maskPhone(customer.phoneE164)} readOnly />
            </label>
            <label className="builder-field">
              Birthday · optional
              <input
                type="date"
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
              />
            </label>
            <button className="builder-primary" onClick={save}>
              Save details
            </button>
          </section>
        )}
        <section className="guest-section" id="messages">
          <h2>Messages</h2>
          <p className="gx-note">
            Each restaurant you&apos;ve joined has its own switch. Your loyalty cards work either
            way.
          </p>
          {memberships.length === 0 && (
            <p className="demo-data-note">Join a restaurant to manage its messages here.</p>
          )}
          {memberships.map((membership) => {
            const restaurant = state.restaurants.find(
              (item) => item.id === membership.restaurantId,
            )!;
            return (
              <article className="consent-setting consent-setting--messages" key={membership.id}>
                <div className="message-restaurant-name"><strong>{restaurant.name}</strong></div>
                <div className="message-toggles">
                  <label className="consent-switch-row">
                    <span>SMS offers</span>
                    <input
                      role="switch"
                      type="checkbox"
                      checked={membership.marketingSms}
                      onChange={(event) => {
                        const result = api.member.setConsent(membership.id, event.target.checked);
                        setNotice(result.ok ? "Preference saved." : result.error.message);
                      }}
                      aria-label={`SMS offers from ${restaurant.name}`}
                    />
                  </label>
                  <label className="consent-switch-row">
                    <span>Push notifications</span>
                    <input
                      role="switch"
                      type="checkbox"
                      checked={membership.marketingPush}
                      disabled={pushBusy === membership.id}
                      onChange={async (event) => {
                        const enabled = event.target.checked;
                        setPushBusy(membership.id);
                        try {
                          if (enabled) {
                            const subscription = await enableBrowserPush(import.meta.env["VITE_VAPID_PUBLIC_KEY"] ?? "");
                            demoRepo.update((current) => ({
                              ...current,
                              memberships: current.memberships.map((item) => item.id === membership.id ? { ...item, marketingPush: true } : item),
                              pushSubscriptions: [...current.pushSubscriptions.filter((item) => item.endpoint !== subscription.endpoint), { id: `push-${crypto.randomUUID()}`, customerId, membershipId: membership.id, restaurantId: restaurant.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, createdAt: new Date(current.now).toISOString() }],
                            }));
                            setNotice("Push enabled on this device.");
                          } else {
                            const endpoint = await disableBrowserPush();
                            demoRepo.update((current) => ({
                              ...current,
                              memberships: current.memberships.map((item) => item.id === membership.id ? { ...item, marketingPush: false } : item),
                              pushSubscriptions: current.pushSubscriptions.filter((item) => item.endpoint !== endpoint),
                            }));
                            setNotice("Push disabled on this device.");
                          }
                        } catch (error) {
                          setNotice(error instanceof Error ? error.message : "Could not update push preference.");
                        } finally {
                          setPushBusy(null);
                        }
                      }}
                      aria-label={`Push notifications from ${restaurant.name}`}
                    />
                  </label>
                  {membership.marketingPush && <button type="button" className="builder-secondary push-test-button" onClick={() => void showLocalPushTest().then(() => setNotice("Test notification shown on this device.")).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not show test notification."))}>Send me a test notification</button>}
                </div>
              </article>
            );
          })}
          {state.consents
            .filter((item) => memberships.some((membership) => membership.id === item.membershipId))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((event) => (
              <p className="consent-history-row" key={event.id}>
                <strong>
                  {event.action} · {event.purpose.replace("_", " ")}
                </strong>
                <small>
                  {event.wordingText} · {event.source} ·{" "}
                  {new Intl.DateTimeFormat("en-ZA", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.createdAt))}
                </small>
              </p>
            ))}
        </section>
        <section className="guest-section">
          <h2>Your data</h2>
          <div className="settings-actions">
            <button className="builder-secondary" onClick={download}>
              Download my data
            </button>
            <button
              className="danger-button"
              disabled={customer.deleted}
              onClick={() => {
                const result = api.member.requestDeletion(customerId);
                setNotice(
                  result.ok
                    ? "Deletion request recorded. Personal details were anonymised in this demo."
                    : result.error.message,
                );
              }}
            >
              Delete my account
            </button>
          </div>
          <p>
            Deletion requests in this demo anonymise name and phone details while keeping activity
            counts.
          </p>
        </section>
        {notice && (
          <p className="demo-data-note" role="status">
            {notice}
          </p>
        )}
      </section>
    </main>
  );
}
