import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDemoState } from "@/data/useDemoState";
import { api } from "@/api";
import { demoRepo } from "@/data/repo";
import { requireRole } from "@/data/session";
import { getDataModeFn } from "@/server/live";
import { birthdayOf, MONTH_NAMES } from "@/lib/birthday";
import { maskPhone } from "@/lib/phone";
import { Switch } from "@/components/patron/Switch";
import { GuestShell } from "@/components/patron/GuestShell";
import { FormField, PageHeader } from "@/components/patron/dash";
import { enableBrowserPush, disableBrowserPush, showLocalPushTest } from "@/lib/web-push-client";
import { PushOptIn } from "@/components/patron/PushOptIn";
import { signOut } from "@/lib/sign-out";

export const Route = createFileRoute("/me/settings")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") throw redirect({ to: "/me" });
    if (
      !requireRole("guest")(demoRepo.read().session) ||
      (typeof window !== "undefined" && !demoRepo.read().session.customerId)
    )
      throw redirect({ to: "/login" });
  },
  component: GuestSettings,
});
function GuestSettings() {
  const state = useDemoState();
  const customerId = state.session.customerId!;
  const customer = state.customers.find((item) => item.id === customerId);
  const [name, setName] = useState(customer?.name ?? "");
  const [birthdayDay, setBirthdayDay] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [notice, setNotice] = useState("");
  const [pushBusy, setPushBusy] = useState<string | null>(null);
  // Fill the form once the demo session/customer is available after hydration.
  useEffect(() => {
    if (!customer) return;
    setName(customer.name);
    const parts = birthdayOf(customer);
    setBirthdayDay(parts ? String(parts.day) : "");
    setBirthdayMonth(parts ? String(parts.month) : "");
  }, [customer]);
  if (!customer)
    return (
      <main className="guest-page">
        <section className="guest-panel">
          <h1>We couldn’t find that guest.</h1>
          <p>This demo guest may have been reset.</p>
          <a className="builder-primary" href="/">
            Back to Patron
          </a>
        </section>
      </main>
    );
  const memberships = state.memberships.filter((item) => item.customerId === customerId);
  const firstName = customer.name.split(" ")[0];
  const save = () => {
    const result = api.member.updateProfile(customerId, {
      name,
      ...(birthdayDay && birthdayMonth
        ? { birthday: { day: Number(birthdayDay), month: Number(birthdayMonth) } }
        : {}),
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
    <GuestShell title={customer.name}>
      <PageHeader
        eyebrow="Me"
        title={`Hi ${firstName}`}
        intro="Your details, the messages each restaurant can send you, and your account."
      />
      {customer.deleted ? (
        <section className="builder-panel">
            <h2>Your personal details have been cleared.</h2>
            <p>Membership and visit counts remain in demo history.</p>
            <p>Data request status: {deletion?.status ?? "open"}</p>
          </section>
        ) : (
          <section className="builder-panel">
            <FormField label="Name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
              />
            </FormField>
            <FormField label="Phone number" hint="Shared by you when you joined.">
              <input value={maskPhone(customer.phoneE164)} readOnly />
            </FormField>
            <div className="builder-field" role="group" aria-label="Birthday, day and month">
              <span>Birthday · optional</span>
              <small className="gx-note" style={{ display: "block" }}>
                Only the day and month are kept, never the year, so places you joined can spoil you
                on your birthday.
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
            <button className="builder-primary" onClick={save}>
              Save details
            </button>
          </section>
        )}
        <section className="builder-panel">
          <PushOptIn />
        </section>
        <section className="builder-panel" id="messages">
          <h2>Messages</h2>
          <p className="gx-note">
            Each restaurant you&apos;ve joined has its own SMS and push switches. Your loyalty cards
            work either way.
          </p>
          {memberships.length === 0 && (
            <p className="demo-data-note">Join a restaurant to manage its messages here.</p>
          )}
          {memberships.map((membership) => {
            const restaurant = state.restaurants.find(
              (item) => item.id === membership.restaurantId,
            )!;
            return (
              <div className="msg-row" role="group" aria-label={restaurant.name} key={membership.id}>
                <div className="msg-row-name">{restaurant.name}</div>
                <div className="msg-row-switches">
                  <Switch
                    label="SMS"
                    hint="Offers by text"
                    checked={membership.marketingSms}
                    onChange={(next) => {
                      const result = api.member.setConsent(membership.id, next);
                      setNotice(result.ok ? "Preference saved." : result.error.message);
                    }}
                  />
                  <Switch
                    label="Push"
                    hint={membership.marketingPush ? "On for this device" : "Offers in the browser"}
                    checked={membership.marketingPush}
                    disabled={pushBusy === membership.id}
                    onChange={async (enabled) => {
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
                  />
                  {membership.marketingPush && <button type="button" className="builder-secondary push-test-button" onClick={() => void showLocalPushTest().then(() => setNotice("Test notification shown on this device.")).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not show test notification."))}>Send me a test notification</button>}
                </div>
              </div>
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
        <section className="builder-panel">
          <h2>Help us improve</h2>
          <p>Found something confusing, or want a feature? The form needs no sign in.</p>
          <a className="builder-secondary" href="/feedback">
            Suggest a feature
          </a>
        </section>
        <section className="builder-panel">
          <h2>Account</h2>
          <p>Log out of this demo guest account on this device. Your saved demo venues stay here.</p>
          <button
            type="button"
            className="builder-secondary"
            data-testid="guest-logout"
            onClick={() => void signOut("demo")}
          >
            Log out
          </button>
        </section>
        <section className="builder-panel">
          <h2>Your data</h2>
          <div className="settings-actions">
            <button className="builder-secondary" onClick={download}>
              Download my data
            </button>
            <button
              className="builder-secondary is-danger"
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
    </GuestShell>
  );
}
