import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api";
import { Badge, ConfirmDialog, PageHeader, StatCard, StatGrid } from "@/components/patron/dash";
import { demoRepo } from "@/data/repo";
import { useDemoState } from "@/data/useDemoState";
import { requireRole } from "@/data/session";
import {
  getCustomerProfileFn,
  getDataModeFn,
  revealCustomerPhoneFn,
  setSmsConsentFn,
} from "@/server/live";
import type { LiveCustomerProfile } from "@/server/live-dashboard";
import { maskLivePhone } from "@/lib/live-customers";
import { birthdayLabel, birthdayOf } from "@/lib/birthday";

export const Route = createFileRoute("/app/customers/$customerId")({
  beforeLoad: async () => {
    const { mode } = await getDataModeFn();
    if (mode === "live") return;
    if (!requireRole("owner", "manager")(demoRepo.read().session)) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async ({ params }) => {
    const { mode } = await getDataModeFn();
    if (mode !== "live") return { mode, live: null };
    return {
      mode,
      live: await getCustomerProfileFn({ data: { customerId: params.customerId } }),
    };
  },
  component: CustomerProfile,
});

function CustomerProfile() {
  const data = Route.useLoaderData();
  if (data.mode === "live") return <LiveCustomerProfile data={data.live} />;
  return <DemoCustomerProfile />;
}

function DemoCustomerProfile() {
  const { customerId } = Route.useParams();
  const state = useDemoState();
  const session = state.session;
  const restaurant =
    state.restaurants.find((item) => item.id === session.restaurantId) ?? state.restaurants[0]!;
  const [notice, setNotice] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const scope = { role: session.role, restaurantId: session.restaurantId };
  const actor = session.staffId ?? session.role;
  const result = api.customers.profile({
    customerId,
    restaurantId: restaurant.id,
    session: scope,
  });
  if (!result.ok) {
    return (
      <main className="demo-hub page-width">
        <h1>We couldn’t find that guest.</h1>
        <p>{result.error.message}</p>
        <a href="/app/customers">Back to customers</a>
      </main>
    );
  }
  const profile = result.data;
  const birthday = birthdayOf(profile.customer);
  const know = api.customers.know({
    membershipId: profile.membership.id,
    restaurantId: restaurant.id,
    session: scope,
  });
  const waitingRewards = profile.rewards.filter((reward) => !reward.redeemedAt).length;
  const maskedPhone = `•••• ${profile.customer.phoneE164.slice(-4)}`;
  const starters = [
    {
      title: "Double stamps",
      body: `Hi {first_name}, double stamps all day at ${restaurant.name}. Pop in and we will add two.`,
    },
    {
      title: "Reward earned",
      body: `Hi {first_name}, your reward is ready at ${restaurant.name}. Show this message at the till to claim it.`,
    },
    {
      title: "Thank you",
      body: `Hi {first_name}, thank you for visiting ${restaurant.name}. We would love to see you again soon.`,
    },
    {
      title: "We miss you",
      body: `Hi {first_name}, we have missed you at ${restaurant.name}. Pop in this week for a warm welcome.`,
    },
  ];
  const starterHref = (title: string, body: string) =>
    `/app/campaigns/new?name=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Customer · ${restaurant.name}`}
        title={profile.customer.name || "(removed)"}
        intro="Their card, visits and consent in one place."
      />
      <StatGrid dense>
        <StatCard
          value={`${profile.membership.stampsCurrent} / ${restaurant.stampsRequired}`}
          label="stamps on the card"
        />
        <StatCard
          value={waitingRewards}
          label={waitingRewards === 1 ? "reward waiting" : "rewards waiting"}
          tone={waitingRewards > 0 ? "good" : undefined}
        />
        <StatCard value={profile.visits.length} label="visits recorded" />
      </StatGrid>
      <div className="demo-control-actions">
        <button
          className="builder-primary"
          onClick={() => {
            const stamped = api.customers.manualStamp({
              membershipId: profile.membership.id,
              actorId: actor,
              session: scope,
            });
            setNotice(stamped.ok ? "Manual stamp added." : stamped.error.message);
          }}
        >
          Add manual stamp
        </button>
        <ConfirmDialog
          label="Remove from my list"
          question="Remove this guest from marketing? Their visit history is kept."
          confirmLabel="Yes, remove"
          buttonClass="destructive-link"
          onConfirm={() => {
            const removed = api.customers.remove({
              membershipId: profile.membership.id,
              actorId: actor,
              session: scope,
            });
            setNotice(removed.ok ? "Removed from marketing; counts kept." : removed.error.message);
          }}
        />
      </div>
      <section className="builder-panel">
        <h2>Message starters</h2>
        <p className="demo-data-note">
          Opens the composer with the wording filled in. You still pick the audience and see the cost
          before anything sends.
        </p>
        <div className="starter-grid">
          {starters.map((starter) => (
            <a className="builder-secondary" key={starter.title} href={starterHref(starter.title, starter.body)}>
              {starter.title}
            </a>
          ))}
        </div>
      </section>
      <section className="builder-panel">
        <h2>Contact</h2>
        <p>
          {phone ? <strong>{phone}</strong> : <span>{maskedPhone}</span>}
          {" "}
          <button
            className="builder-secondary"
            onClick={() => {
              const revealed = api.customers.reveal({
                customerId,
                restaurantId: restaurant.id,
                actorId: actor,
                session: scope,
              });
              if (revealed.ok) setPhone(revealed.data.phone);
              else setNotice(revealed.error.message);
            }}
          >
            {phone ? "Reveal again" : "Reveal phone"}
          </button>
        </p>
        <p className="demo-data-note">
          Revealing a number is written to the activity log, so every look is traceable.
        </p>
      </section>
      {birthday && (
        <p className="guest-birthday-line">
          Birthday: <strong>{birthdayLabel(birthday)}</strong>
          <small> · day and month only, shared by the guest</small>
        </p>
      )}
      {know.ok && (
        <section className="builder-panel know-guest">
          <h2>Know your guest</h2>
          <p className="know-sentence">{know.data.sentence}</p>
          <dl className="know-facts">
            <div>
              <dt>Favourite items</dt>
              <dd>
                {know.data.topItems.length === 0
                  ? "Nothing captured yet"
                  : know.data.topItems
                      .map((entry) => `${entry.label} (${entry.qty})`)
                      .join(", ")}
              </dd>
            </div>
            <div>
              <dt>Visit pattern</dt>
              <dd>{know.data.patternSummary}</dd>
            </div>
            <div>
              <dt>Birthday</dt>
              <dd>{know.data.birthday ?? "Not shared yet"}</dd>
            </div>
            <div>
              <dt>Rewards</dt>
              <dd>
                {know.data.rewardsWaiting} waiting, {know.data.rewardsRedeemed} redeemed
              </dd>
            </div>
            <div>
              <dt>Last message</dt>
              <dd>
                {know.data.lastMessage === null
                  ? "No messages sent yet"
                  : `${new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(know.data.lastMessage.sentAt))}, ${know.data.lastMessage.worked ? "delivered" : "did not go through"}. "${know.data.lastMessage.body}"`}
              </dd>
            </div>
          </dl>
        </section>
      )}
      <section className="builder-panel">
        <h2>Visit timeline</h2>
        {profile.visits.length === 0 && <p>No visits yet.</p>}
        {profile.visits.map((visit) => (
          <p className="visit-row" key={visit.id}>
            <span>
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(visit.createdAt))}
            </span>
            <strong>{visit.status === "valid" ? "Stamp collected" : "Stamp adjusted"}</strong>
          </p>
        ))}
      </section>
      <section className="builder-panel">
        <h2>Rewards</h2>
        {profile.rewards.length === 0 && <p>No rewards yet.</p>}
        {profile.rewards.map((reward) => (
          <div className="guest-list-item" key={reward.id}>
            <span>
              <strong>{reward.description}</strong>
              <Badge tone={reward.redeemedAt ? undefined : "active"}>
                {reward.redeemedAt ? "Redeemed" : "Waiting"}
              </Badge>
            </span>
            {!reward.redeemedAt && (
              <ConfirmDialog
                label="Mark redeemed"
                question={`Mark "${reward.description}" as redeemed at the till? This cannot be undone.`}
                confirmLabel="Yes, mark redeemed"
                buttonClass="builder-secondary"
                onConfirm={() => {
                  const redeemed = api.stamp.redeemReward({
                    rewardId: reward.id,
                    actorId: actor,
                    session: scope,
                  });
                  setNotice(
                    redeemed.ok
                      ? `Marked "${reward.description}" as redeemed.`
                      : redeemed.error.message,
                  );
                }}
              />
            )}
          </div>
        ))}
      </section>
      <section className="builder-panel">
        <h2>Consent history</h2>
        {profile.consents.length === 0 && (
          <p className="builder-hint">No changes to messages or permissions yet.</p>
        )}
        {profile.consents.map((event) => (
          <p className="consent-history-row" key={event.id}>
            <strong>
              {event.purpose} · {event.action}
            </strong>
            <small>
              {event.source} ·{" "}
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "medium",
              }).format(new Date(event.createdAt))}
            </small>
          </p>
        ))}
      </section>
            {notice && (
        <p role="status" className="demo-data-note">
          {notice}
        </p>
      )}
      <p>
        <a href="/app/customers">Back to customers</a>
      </p>
    </main>
  );
}

function LiveCustomerProfile({ data }: { data: LiveCustomerProfile | null }) {
  const [smsOn, setSmsOn] = useState(data?.smsOptedIn ?? false);
  const [phone, setPhone] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) {
    return (
      <main className="demo-hub page-width">
        <PageHeader
          eyebrow="Live mode"
          title="We could not find that guest."
          intro="The guest may belong to another restaurant, or the link is out of date."
        />
        <a className="builder-secondary" href="/app/customers">
          Back to customers
        </a>
      </main>
    );
  }
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(iso));
  return (
    <main className="demo-hub page-width">
      <PageHeader
        eyebrow={`Customer · ${data.restaurantName}`}
        title={data.name}
        intro="Read from the live guest record. Editing, manual stamps and phone reveal come next."
      />
      <StatGrid dense>
        <StatCard
          value={`${data.stampsCurrent} / ${data.stampsRequired}`}
          label="stamps on the card"
        />
        <StatCard
          value={data.rewardsWaiting}
          label={data.rewardsWaiting === 1 ? "reward waiting" : "rewards waiting"}
          tone={data.rewardsWaiting > 0 ? "good" : undefined}
        />
        <StatCard value={data.stampsTotal} label="visits recorded" />
      </StatGrid>
      <section className="builder-panel">
        <h2>Contact</h2>
        <p>{phone ?? maskLivePhone(data.phoneE164)}</p>
        <div className="demo-control-actions">
          <button
            className="builder-secondary"
            type="button"
            disabled={busy || phone !== null}
            onClick={async () => {
              setBusy(true);
              const result = await revealCustomerPhoneFn({
                data: { customerId: data.customerId },
              });
              setBusy(false);
              if (result.ok) {
                setPhone(result.phone);
                setNotice("Phone revealed. This was written to the activity log.");
              } else {
                setNotice(result.message);
              }
            }}
          >
            {phone ? "Phone revealed" : "Reveal phone"}
          </button>
          <button
            className="builder-secondary"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await setSmsConsentFn({
                data: { membershipId: data.membershipId, enabled: !smsOn },
              });
              setBusy(false);
              if (result.ok) {
                setSmsOn(result.enabled);
                setNotice(result.enabled ? "SMS consent turned on." : "SMS consent turned off.");
              } else {
                setNotice(result.message);
              }
            }}
          >
            {smsOn ? "Turn SMS off" : "Turn SMS on"}
          </button>
        </div>
        <p className="demo-data-note">
          SMS marketing is {smsOn ? "on" : "off"}. Joined {when(data.joinedAt)}.
        </p>
        {notice && <p className="demo-data-note" role="status">{notice}</p>}
      </section>
      <section className="builder-panel">
        <h2>Recent visits</h2>
        {data.stamps.length === 0 ? (
          <p className="demo-data-note">No visits recorded yet.</p>
        ) : (
          <ul className="clean-list">
            {data.stamps.map((stamp) => (
              <li key={stamp.id}>
                {when(stamp.createdAt)} · {stamp.status === "valid" ? "Stamp" : "Undone"}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="builder-panel">
        <h2>Rewards</h2>
        {data.rewards.length === 0 ? (
          <p className="demo-data-note">No rewards earned yet.</p>
        ) : (
          data.rewards.map((reward) => (
            <div className="outbox-meta" key={reward.id}>
              <span>{reward.description}</span>
              <Badge tone={reward.status === "available" ? "active" : undefined}>
                {reward.status === "available" ? "Ready" : reward.status}
              </Badge>
            </div>
          ))
        )}
      </section>
      <section className="builder-panel">
        <h2>Consent history</h2>
        {data.consents.length === 0 ? (
          <p className="demo-data-note">No consent changes recorded.</p>
        ) : (
          <ul className="clean-list">
            {data.consents.map((consent) => (
              <li key={consent.id}>
                {when(consent.createdAt)} · {consent.purpose.replace("_", " ")} · {consent.action}
              </li>
            ))}
          </ul>
        )}
      </section>
      <a className="builder-secondary" href="/app/customers">
        Back to customers
      </a>
    </main>
  );
}
